import React from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Paper,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { AddOutlined, HistoryOutlined, PaymentsOutlined } from '@mui/icons-material';
import ScreenHeader from '../components/ScreenHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { paiseFromRupees, prettyDate, rupees, today } from '../lib/format.js';

const blankPeriod = () => {
  const date = new Date();
  const start = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  return {
    period_start: start,
    period_end: today(), employee_id: '', bonus: '', overtime: '', allowances: '', deductions: ''
  };
};
const isoDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (value, days) => {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
};
const emptyPayment = { amount: '', payment_date: today(), method: 'Cash', reference_number: '', remarks: '' };

export default function Salaries({ notify }) {
  const [employees, setEmployees] = React.useState([]);
  const [records, setRecords] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [period, setPeriod] = React.useState(blankPeriod);
  const [paymentRecord, setPaymentRecord] = React.useState(null);
  const [payment, setPayment] = React.useState(emptyPayment);
  const [historyRecord, setHistoryRecord] = React.useState(null);
  const [paymentHistory, setPaymentHistory] = React.useState([]);
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
    if (period.period_end < period.period_start) {
      notify('Salary period end must be on or after its start date', 'error');
      return;
    }
    if (period.period_start < employee.joining_date) {
      notify(`Salary period cannot start before the employee's joining date (${prettyDate(employee.joining_date)})`, 'error');
      return;
    }
    if (employee.payment_frequency === 'Weekly') {
      const days = (Date.parse(`${period.period_end}T00:00:00Z`) - Date.parse(`${period.period_start}T00:00:00Z`)) / 86400000 + 1;
      if (days !== 7) {
        notify('Weekly salary periods must contain exactly 7 days', 'error');
        return;
      }
    }
    setBusy(true);
    try {
      const [attendance, advances] = await Promise.all([
        window.payroll.attendance.list({ employee_id: employee.id, from: period.period_start, to: period.period_end }),
        window.payroll.advances.list({ employee_id: employee.id })
      ]);
      const unpaidDays = attendance.filter((item) => item.status === 'Absent' || item.status === 'Unpaid Leave').length;
      const halfDays = attendance.filter((item) => item.status === 'Half Day').length;
      const unpaidDayUnits = unpaidDays + halfDays * 0.5;
      const divisor = employee.payment_frequency === 'Weekly' ? Math.min(employee.working_days || 6, 7) : employee.working_days || 26;
      const basic = employee.basic_salary_paise || 0;
      const unpaidDeduction = Math.round(basic * unpaidDayUnits / divisor);
      const bonus = paiseFromRupees(period.bonus);
      const overtime = paiseFromRupees(period.overtime);
      const allowances = paiseFromRupees(period.allowances);
      const deductions = paiseFromRupees(period.deductions);
      const gross = Math.max(0, basic - unpaidDeduction) + bonus + overtime + allowances;
      const beforeAdvance = Math.max(0, gross - deductions);
      const outstanding = advances.filter((item) => item.payment_date <= period.period_end)
        .reduce((sum, item) => sum + item.outstanding_paise, 0);
      const advanceAdjustment = Math.min(beforeAdvance, outstanding);
      setPreview({
        employee, attendance, unpaidDays, halfDays, unpaidDayUnits, basic, unpaidDeduction, bonus, overtime, allowances, deductions,
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
        overtime_paise: paiseFromRupees(period.overtime),
        allowances_paise: paiseFromRupees(period.allowances),
        deductions_paise: paiseFromRupees(period.deductions)
      });
      notify('Salary processed and calculation snapshot saved');
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
      notify('Salary payment recorded');
      setPaymentRecord(null);
      setPayment(emptyPayment);
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
    <ScreenHeader title="Salary management" subtitle="Process weekly or monthly payroll, review calculations and record full or partial payments." actionLabel="Process salary" onAction={() => { setPeriod(blankPeriod()); setPreview(null); setOpen(true); }} icon={AddOutlined} />
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Box sx={{ p: 2 }}><Typography fontWeight={700}>Salary records</Typography></Box>
      <Box className="page-table-wrap"><Table><TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Period</TableCell><TableCell>Frequency</TableCell><TableCell align="right">Net payable</TableCell><TableCell align="right">Paid</TableCell><TableCell align="right">Balance</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
        <TableBody>{records.map((record) => {
          const due = record.net_paise - record.paid_paise;
          return <TableRow key={record.id} hover>
            <TableCell>{record.full_name}<Typography variant="caption" display="block" color="text.secondary">{record.employee_code}</Typography></TableCell>
            <TableCell>{prettyDate(record.period_start)} – {prettyDate(record.period_end)}</TableCell><TableCell>{record.frequency}</TableCell>
            <TableCell align="right">{rupees(record.net_paise)}</TableCell><TableCell align="right">{rupees(record.paid_paise)}</TableCell>
            <TableCell align="right">{rupees(due)}</TableCell><TableCell><StatusChip status={record.status} /></TableCell>
            <TableCell align="right"><Stack direction="row" spacing={0.5} justifyContent="flex-end">
              {record.paid_paise > 0 && <Button size="small" startIcon={<HistoryOutlined />} onClick={() => showPaymentHistory(record)}>History</Button>}
              {due > 0 && <Button size="small" variant="outlined" startIcon={<PaymentsOutlined />} onClick={() => {
                setPaymentRecord(record);
                setPayment({ ...emptyPayment, amount: (due / 100).toFixed(2) });
              }}>Pay</Button>}
            </Stack></TableCell>
          </TableRow>;
        })}
          {!records.length && <TableRow><TableCell colSpan={8}><Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>No salary records yet. Process a salary to create the first record.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
    <Dialog open={open} onClose={() => { setOpen(false); setPreview(null); }} maxWidth="md" fullWidth>
      <DialogTitle>{preview ? 'Review salary breakdown' : 'Generate salary'}</DialogTitle>
      <DialogContent dividers>
        {!preview ? <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select required label="Employee" value={period.employee_id} onChange={(event) => {
            const selected = employees.find((item) => item.id === Number(event.target.value));
            const updates = { ...period, employee_id: event.target.value };
            if (selected?.payment_frequency === 'Weekly') {
              const start = new Date();
              start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
              const weekStart = isoDate(start);
              updates.period_start = selected.joining_date > weekStart ? selected.joining_date : weekStart;
              updates.period_end = addDays(updates.period_start, 6);
            } else if (selected?.joining_date && updates.period_start < selected.joining_date) {
              updates.period_start = selected.joining_date;
            }
            setPeriod(updates);
          }}>
            {employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.full_name} · {employee.payment_frequency} · {rupees(employee.basic_salary_paise)}</MenuItem>)}
          </TextField>
          {selectedEmployee && <Typography variant="caption" color="text.secondary">
            Salary periods must start on or after {prettyDate(selectedEmployee.joining_date)}. The start date was adjusted if needed.
          </Typography>}
          <Grid container spacing={2}>
            <Grid item xs={6}><TextField fullWidth required label="Period start" type="date" inputProps={{ min: selectedEmployee?.joining_date }} InputLabelProps={{ shrink: true }} value={period.period_start} onChange={setPeriodField('period_start')} /></Grid>
            <Grid item xs={6}><TextField fullWidth required label="Period end" type="date" InputLabelProps={{ shrink: true }} value={period.period_end} onChange={setPeriodField('period_end')} /></Grid>
          </Grid>
          <Grid container spacing={2}>
            {[['bonus', 'Bonus'], ['overtime', 'Overtime'], ['allowances', 'Allowances'], ['deductions', 'Other deductions']].map(([key, title]) =>
              <Grid item xs={6} sm={3} key={key}><TextField fullWidth label={`${title} (₹)`} type="number" inputProps={{ min: 0, step: '0.01' }} value={period[key]} onChange={setPeriodField(key)} /></Grid>)}
          </Grid>
          <Typography variant="caption" color="text.secondary">Unpaid leave and absent days are deducted from the salary using the employee's configured working days. Outstanding advances paid by the period end are adjusted once.</Typography>
        </Stack> : <Box sx={{ pt: 1 }}>
          <Typography fontWeight={700} variant="h6">{preview.employee.full_name} · {preview.employee.payment_frequency}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{prettyDate(preview.period_start)} – {prettyDate(preview.period_end)} · {preview.attendance.length} attendance records</Typography>
          <Paper variant="outlined" sx={{ p: 2 }}>
            {[
              ['Basic salary', preview.basic],
              ['Unpaid leave / absent deduction', -preview.unpaidDeduction],
              ['Bonus', preview.bonus], ['Overtime', preview.overtime], ['Allowances', preview.allowances],
              ['Gross salary', preview.gross], ['Other deductions', -preview.deductions],
              ['Advance adjustment', -preview.advanceAdjustment]
            ].map(([label, amount], index) => <Stack key={label} direction="row" justifyContent="space-between" sx={{ py: 0.8, borderBottom: index === 5 ? '1px solid' : 0, borderColor: 'divider' }}>
              <Typography fontWeight={index === 5 ? 700 : 400}>{label}</Typography>
              <Typography fontWeight={index === 5 ? 700 : 500}>{amount < 0 ? `− ${rupees(Math.abs(amount))}` : rupees(amount)}</Typography>
            </Stack>)}
            <Stack direction="row" justifyContent="space-between" sx={{ pt: 1.5 }}>
              <Typography variant="h6">Net payable</Typography><Typography variant="h6" color="primary.main">{rupees(preview.net)}</Typography>
            </Stack>
          </Paper>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
            {preview.unpaidDays} unpaid/absent day(s), {preview.halfDays} half day(s) · Outstanding advance before adjustment: {rupees(preview.outstanding)}. Confirming creates an immutable salary snapshot.
          </Typography>
        </Box>}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={() => { setOpen(false); setPreview(null); }}>Cancel</Button>
        {preview && <Button onClick={() => setPreview(null)}>Edit inputs</Button>}
        {!preview ? <Button variant="contained" disabled={busy || !period.employee_id || !period.period_start || !period.period_end} onClick={generatePreview}>{busy ? 'Calculating…' : 'Generate breakdown'}</Button> :
          <Button variant="contained" disabled={busy} onClick={confirmSalary}>{busy ? 'Processing…' : 'Confirm salary'}</Button>}
      </DialogActions>
    </Dialog>
    <Dialog open={Boolean(paymentRecord)} onClose={() => setPaymentRecord(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Record salary payment</DialogTitle>
      <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary">{paymentRecord?.full_name} · Outstanding {rupees((paymentRecord?.net_paise || 0) - (paymentRecord?.paid_paise || 0))}</Typography>
        <TextField required label="Payment amount (₹)" type="number" inputProps={{ min: 0.01, step: '0.01', max: ((paymentRecord?.net_paise || 0) - (paymentRecord?.paid_paise || 0)) / 100 }} value={payment.amount} onChange={setPaymentField('amount')} />
        <Grid container spacing={2}><Grid item xs={6}><TextField fullWidth required label="Payment date" type="date" InputLabelProps={{ shrink: true }} value={payment.payment_date} onChange={setPaymentField('payment_date')} /></Grid>
          <Grid item xs={6}><TextField fullWidth select label="Method" value={payment.method} onChange={setPaymentField('method')}>
            {['Cash', 'Bank', 'UPI'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
          </TextField></Grid></Grid>
        <TextField label="Reference number" value={payment.reference_number} onChange={setPaymentField('reference_number')} />
        <TextField label="Remarks" value={payment.remarks} onChange={setPaymentField('remarks')} />
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setPaymentRecord(null)}>Cancel</Button>
        <Button variant="contained" disabled={busy || !payment.amount || Number(payment.amount) <= 0} onClick={submitPayment}>{busy ? 'Saving…' : 'Record payment'}</Button></DialogActions>
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
