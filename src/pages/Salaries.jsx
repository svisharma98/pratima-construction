import React from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Paper,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { AddOutlined, HistoryOutlined, PaymentsOutlined, ReceiptLongOutlined } from '@mui/icons-material';
import ScreenHeader from '../components/ScreenHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { paiseFromRupees, prettyDate, rupees, today } from '../lib/format.js';

const blankPeriod = () => {
  const date = new Date();
  const start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  return {
    period_start: start,
    period_end: today(), employee_id: '', bonus: '', allowances: '', deductions: ''
  };
};
const emptyPayment = { amount: '', payment_date: today(), method: 'Cash', reference_number: '', remarks: '' };
const attendanceSnapshot = (record) => JSON.parse(record.attendance_snapshot || '{}');

export default function Salaries({ notify, onOpenSlips }) {
  const [employees, setEmployees] = React.useState([]);
  const [records, setRecords] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [period, setPeriod] = React.useState(blankPeriod);
  const [paymentRecord, setPaymentRecord] = React.useState(null);
  const [payment, setPayment] = React.useState(emptyPayment);
  const [historyRecord, setHistoryRecord] = React.useState(null);
  const [paymentHistory, setPaymentHistory] = React.useState([]);
  const [recalculateRecord, setRecalculateRecord] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    try {
      const [people, salaries] = await Promise.all([window.payroll.employees.list({ status: 'Active' }), window.payroll.salaries.list()]);
      setEmployees(people);
      setRecords(salaries);
    } catch (error) { notify(error.message, 'error'); }
  }, [notify]);
  React.useEffect(() => { load(); }, [load]);
  const setPeriodField = (field) => (event) => setPeriod((current) => ({ ...current, [field]: event.target.value }));
  const setPaymentField = (field) => (event) => setPayment((current) => ({ ...current, [field]: event.target.value }));

  const generatePreview = async () => {
    const employee = employees.find((item) => item.id === Number(period.employee_id));
    if (!employee) return;
    if (employee.daily_rate_needs_review) {
      notify("Review and save this labourer's daily rate in the Labourers page before processing a bill", 'error');
      return;
    }
    if (!employee.daily_rate_paise || employee.daily_rate_paise <= 0) {
      notify("Set this labourer's daily rate in the Labourers page before processing a bill", 'error');
      return;
    }
    if (period.period_end < period.period_start) {
      notify('Bill period end must be on or after its start date', 'error');
      return;
    }
    if (period.period_start < employee.joining_date) {
      notify(`Bill period cannot start before the labourer's joining date (${prettyDate(employee.joining_date)})`, 'error');
      return;
    }
    setBusy(true);
    try {
      const [attendance, advances] = await Promise.all([
        window.payroll.attendance.list({ employee_id: employee.id, from: period.period_start, to: period.period_end }),
        window.payroll.advances.list({ employee_id: employee.id })
      ]);
      const attendanceHours = attendance.reduce((sum, item) => sum + (
        item.status === 'Present' && item.working_hours <= 0 ? 8 : item.working_hours
      ), 0);
      const earned = Math.round((employee.daily_rate_paise || 0) * attendanceHours / 8);
      const bonus = paiseFromRupees(period.bonus);
      const allowances = paiseFromRupees(period.allowances);
      const deductions = paiseFromRupees(period.deductions);
      const gross = earned + bonus + allowances;
      const beforeAdvance = Math.max(0, gross - deductions);
      const outstanding = advances.filter((item) => item.payment_date <= period.period_end)
        .reduce((sum, item) => sum + item.outstanding_paise, 0);
      const advanceAdjustment = Math.min(beforeAdvance, outstanding);
      setPreview({
        employee, attendance, attendanceHours, earned, bonus, allowances, deductions,
        gross, beforeAdvance, advanceAdjustment, net: beforeAdvance - advanceAdjustment,
        outstanding, period_start: period.period_start, period_end: period.period_end
      });
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };

  const confirmSalary = async () => {
    setBusy(true);
    try {
      await window.payroll.salaries.process({
        employee_id: Number(period.employee_id),
        period_start: period.period_start,
        period_end: period.period_end,
        bonus_paise: paiseFromRupees(period.bonus),
        allowances_paise: paiseFromRupees(period.allowances),
        deductions_paise: paiseFromRupees(period.deductions)
      });
      notify('Bill saved. Check “Amount still to pay” and record the payment after paying the labourer.');
      setPreview(null);
      setOpen(false);
      setPeriod(blankPeriod());
      load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };

  const submitPayment = async () => {
    setBusy(true);
    try {
      await window.payroll.salaries.pay({
        salary_record_id: paymentRecord.id,
        amount_paise: paiseFromRupees(payment.amount),
        payment_date: payment.payment_date,
        method: payment.method,
        reference_number: payment.reference_number,
        remarks: payment.remarks
      });
      notify('Labour payment recorded');
      setPaymentRecord(null);
      setPayment(emptyPayment);
      load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const recalculateUnpaidBill = async () => {
    setBusy(true);
    try {
      await window.payroll.salaries.recalculateUnpaid({ salary_record_id: recalculateRecord.id });
      notify('Bill amount recalculated using the saved daily rate');
      setRecalculateRecord(null);
      load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const showPaymentHistory = async (record) => {
    try {
      setPaymentHistory(await window.payroll.salaries.payments({ salary_record_id: record.id }));
      setHistoryRecord(record);
    } catch (error) { notify(error.message, 'error'); }
  };
  const selectedEmployee = employees.find((employee) => employee.id === Number(period.employee_id));

  return <>
    <ScreenHeader title="Labour billing" subtitle="Calculate wages from each labourer's daily rate and recorded attendance hours." actionLabel="Process labour bill" onAction={() => { setPeriod(blankPeriod()); setPreview(null); setOpen(true); }} icon={AddOutlined} />
    <Alert severity="info" action={<Button color="inherit" size="small" startIcon={<ReceiptLongOutlined />} onClick={onOpenSlips}>Salary slips</Button>} sx={{ mb: 2 }}>
      After processing a bill, the “Amount still to pay” is what remains to pay the labourer. Pay them as usual, then select “Record payment” to update the balance.
    </Alert>
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Box sx={{ p: 2 }}><Typography fontWeight={700}>Labour bills</Typography></Box>
      <Box className="page-table-wrap"><Table><TableHead><TableRow><TableCell>Labourer</TableCell><TableCell>Period</TableCell><TableCell align="right">Hours</TableCell><TableCell align="right">Bill amount</TableCell><TableCell align="right">Paid so far</TableCell><TableCell align="right">Amount still to pay</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
        <TableBody>{records.map((record) => {
          const due = record.net_paise - record.paid_paise;
          return <TableRow key={record.id} hover>
            <TableCell>{record.full_name}<Typography variant="caption" display="block" color="text.secondary">{record.employee_code} · {rupees(record.basic_paise)}/day</Typography></TableCell>
            <TableCell>{prettyDate(record.period_start)} – {prettyDate(record.period_end)}</TableCell>
            <TableCell align="right">{attendanceSnapshot(record).attendanceHours ?? '—'}</TableCell>
            <TableCell align="right">{rupees(record.net_paise)}</TableCell><TableCell align="right">{rupees(record.paid_paise)}</TableCell>
            <TableCell align="right">{rupees(due)}</TableCell><TableCell><StatusChip status={record.status} /></TableCell>
            <TableCell align="right"><Stack direction="row" spacing={0.5} justifyContent="flex-end">
              {record.paid_paise > 0 && <Button size="small" startIcon={<HistoryOutlined />} onClick={() => showPaymentHistory(record)}>History</Button>}
              {record.net_paise === 0 && record.paid_paise === 0 && (attendanceSnapshot(record).attendanceHours || 0) > 0 && <Button size="small" variant="outlined" onClick={() => setRecalculateRecord(record)}>Fix bill amount</Button>}
              {due > 0 && <Button size="small" variant="outlined" startIcon={<PaymentsOutlined />} onClick={() => {
                setPaymentRecord(record);
                setPayment({ ...emptyPayment, amount: (due / 100).toFixed(2) });
              }}>Record payment</Button>}
            </Stack></TableCell>
          </TableRow>;
        })}
          {!records.length && <TableRow><TableCell colSpan={8}><Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>No labour bills yet. Process a bill to create the first record.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
    <Dialog open={Boolean(recalculateRecord)} onClose={() => !busy && setRecalculateRecord(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Fix this bill amount?</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography>
            This bill has {attendanceSnapshot(recalculateRecord || {}).attendanceHours || 0} recorded working hours but ₹0.00 payable.
          </Typography>
          <Typography>
            Recalculation will use the labourer’s current saved daily rate ({rupees(recalculateRecord?.current_daily_rate_paise)}/day), attendance, and weekly payments. This is available only because no payment has been recorded for this bill.
          </Typography>
          {recalculateRecord?.current_daily_rate_paise > 0 && <Typography fontWeight={700} color="primary.main">
            Estimated wages before weekly-payment deductions: {rupees(Math.round(recalculateRecord.current_daily_rate_paise * (attendanceSnapshot(recalculateRecord).attendanceHours || 0) / 8))}
          </Typography>}
          {recalculateRecord && recalculateRecord.current_daily_rate_paise <= 0 && <Typography color="error.main">
            First go to Labourers, edit this labourer, and save the correct daily rate.
          </Typography>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={() => setRecalculateRecord(null)}>Cancel</Button>
        <Button variant="contained" disabled={busy || !(recalculateRecord?.current_daily_rate_paise > 0)} onClick={recalculateUnpaidBill}>
          {busy ? 'Recalculating…' : 'Recalculate bill'}
        </Button>
      </DialogActions>
    </Dialog>
    <Dialog open={open} onClose={() => { setOpen(false); setPreview(null); }} maxWidth="md" fullWidth>
      <DialogTitle>{preview ? 'Review labour bill' : 'Process labour bill'}</DialogTitle>
      <DialogContent dividers>
        {!preview ? <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select required label="Employee" value={period.employee_id} onChange={(event) => {
            const selected = employees.find((item) => item.id === Number(event.target.value));
            const updates = { ...period, employee_id: event.target.value };
            if (selected?.joining_date && updates.period_start < selected.joining_date) {
              updates.period_start = selected.joining_date;
            }
            setPeriod(updates);
          }}>
            {employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.full_name} · {employee.daily_rate_needs_review ? 'Rate needs review' : `${rupees(employee.daily_rate_paise)}/day`}</MenuItem>)}
          </TextField>
          {selectedEmployee && <Typography variant="caption" color="text.secondary">
            Bill periods must start on or after {prettyDate(selectedEmployee.joining_date)}. The start date was adjusted if needed.
          </Typography>}
          <Grid container spacing={2}>
            <Grid item xs={6}><TextField fullWidth required label="Period start" type="date" inputProps={{ min: selectedEmployee?.joining_date }} InputLabelProps={{ shrink: true }} value={period.period_start} onChange={setPeriodField('period_start')} /></Grid>
            <Grid item xs={6}><TextField fullWidth required label="Period end" type="date" InputLabelProps={{ shrink: true }} value={period.period_end} onChange={setPeriodField('period_end')} /></Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary">
            Wages are calculated from hours worked at the daily rate ÷ 8. A present day defaults to 8 hours; change the hours for a shorter or longer shift.
          </Typography>
          <Grid container spacing={2}>
            {[['bonus', 'Bonus'], ['allowances', 'Allowances'], ['deductions', 'Other deductions']].map(([key, title]) =>
              <Grid item xs={6} sm={3} key={key}><TextField fullWidth label={`${title} (₹)`} type="number" inputProps={{ min: 0, step: '0.01' }} value={period[key]} onChange={setPeriodField(key)} /></Grid>)}
          </Grid>
          <Typography variant="caption" color="text.secondary">Days without attendance are not billed. Any weekly payments you recorded by the bill end date will be deducted automatically.</Typography>
        </Stack> : <Box sx={{ pt: 1 }}>
          <Typography fontWeight={700} variant="h6">{preview.employee.full_name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{prettyDate(preview.period_start)} – {prettyDate(preview.period_end)} · {preview.attendance.length} attendance records</Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            {[
              ['Daily rate (8 hours)', preview.employee.daily_rate_paise],
              ['Hours worked', preview.attendanceHours],
              ['Wages for recorded hours', preview.earned],
              ['Bonus', preview.bonus], ['Allowances', preview.allowances],
              ['Gross wages', preview.gross], ['Other deductions', -preview.deductions],
              ['Weekly payments already paid (deducted)', -preview.advanceAdjustment]
            ].map(([label, amount], index) => <Stack key={label} direction="row" justifyContent="space-between" sx={{ py: 0.8, borderBottom: index === 5 ? '1px solid' : 0, borderColor: 'divider' }}>
              <Typography fontWeight={index === 5 ? 700 : 400}>{label}</Typography>
              <Typography fontWeight={index === 5 ? 700 : 500}>{label === 'Hours worked' ? amount : amount < 0 ? `− ${rupees(Math.abs(amount))}` : rupees(amount)}</Typography>
            </Stack>)}
            <Stack direction="row" justifyContent="space-between" sx={{ pt: 1.5 }}>
              <Typography variant="h6">Amount to pay labourer</Typography><Typography variant="h6" color="primary.main">{rupees(preview.net)}</Typography>
            </Stack>
          </Paper>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
            Worked {preview.attendanceHours} hours. Weekly payments of {rupees(preview.advanceAdjustment)} are deducted from the wages. Amount left to pay: {rupees(preview.net)}.
          </Typography>
        </Box>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={() => { setOpen(false); setPreview(null); }}>Cancel</Button>
        {preview && <Button onClick={() => setPreview(null)}>Edit inputs</Button>}
        {!preview ? <Button variant="contained" disabled={busy || !period.employee_id || !period.period_start || !period.period_end || selectedEmployee?.daily_rate_needs_review} onClick={generatePreview}>{busy ? 'Calculating…' : 'Preview labour bill'}</Button> :
        <Button variant="contained" disabled={busy} onClick={confirmSalary}>{busy ? 'Processing…' : 'Confirm labour bill'}</Button>}
      </DialogActions>
    </Dialog>
    <Dialog open={Boolean(paymentRecord)} onClose={() => setPaymentRecord(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Record labour payment</DialogTitle>
      <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">
          Pay the labourer outside this app, then enter the amount you paid. The remaining amount to pay is <strong>{rupees((paymentRecord?.net_paise || 0) - (paymentRecord?.paid_paise || 0))}</strong>.
        </Alert>
        <TextField required label="Amount paid now (₹)" type="number" inputProps={{ min: 0.01, step: '0.01', max: ((paymentRecord?.net_paise || 0) - (paymentRecord?.paid_paise || 0)) / 100 }} value={payment.amount} onChange={setPaymentField('amount')} />
        <Grid container spacing={2}><Grid item xs={6}><TextField fullWidth required label="Payment date" type="date" InputLabelProps={{ shrink: true }} value={payment.payment_date} onChange={setPaymentField('payment_date')} /></Grid>
          <Grid item xs={6}><TextField fullWidth select label="Method" value={payment.method} onChange={setPaymentField('method')}>
            {['Cash', 'Bank', 'UPI'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
          </TextField></Grid></Grid>
        <TextField label="Reference number" value={payment.reference_number} onChange={setPaymentField('reference_number')} />
        <TextField label="Remarks" value={payment.remarks} onChange={setPaymentField('remarks')} />
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setPaymentRecord(null)}>Cancel</Button>
        <Button variant="contained" disabled={busy || !payment.amount || Number(payment.amount) <= 0} onClick={submitPayment}>{busy ? 'Saving…' : 'Save payment record'}</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(historyRecord)} onClose={() => setHistoryRecord(null)} maxWidth="md" fullWidth>
      <DialogTitle>Payment history · {historyRecord?.full_name}</DialogTitle>
      <DialogContent dividers>
        <Box className="page-table-wrap"><Table size="small"><TableHead><TableRow><TableCell>Transaction</TableCell><TableCell>Payment date</TableCell><TableCell>Method</TableCell><TableCell>Reference</TableCell><TableCell align="right">Amount</TableCell><TableCell>Remarks</TableCell></TableRow></TableHead>
          <TableBody>{paymentHistory.map((item) => <TableRow key={item.id}>
            <TableCell>{item.transaction_id}</TableCell><TableCell>{prettyDate(item.payment_date)}</TableCell>
            <TableCell>{item.method}</TableCell><TableCell>{item.reference_number || '—'}</TableCell>
            <TableCell align="right">{rupees(item.amount_paise)}</TableCell><TableCell>{item.remarks || '—'}</TableCell>
          </TableRow>)}
            {!paymentHistory.length && <TableRow><TableCell colSpan={6}><Typography textAlign="center" color="text.secondary" sx={{ py: 4 }}>No payments recorded.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table></Box>
      </DialogContent>
      <DialogActions><Button onClick={() => setHistoryRecord(null)}>Close</Button></DialogActions>
    </Dialog>
  </>;
}
