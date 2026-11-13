import React from 'react';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { AddOutlined, AccountBalanceWalletOutlined, EditOutlined } from '@mui/icons-material';
import ScreenHeader from '../components/ScreenHeader.jsx';
import { paiseFromRupees, prettyDate, rupees, today } from '../lib/format.js';

const initialForm = { employee_id: '', payment_date: today(), amount: '', method: 'Cash', reference_number: '', remarks: '' };
const initialAdjustment = { direction: 'Reduce outstanding', amount: '', reason: '' };
export default function Advances({ notify }) {
  const [employees, setEmployees] = React.useState([]);
  const [advances, setAdvances] = React.useState([]);
  const [adjustments, setAdjustments] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(initialForm);
  const [adjustmentAdvance, setAdjustmentAdvance] = React.useState(null);
  const [adjustment, setAdjustment] = React.useState(initialAdjustment);
  const [savingAdjustment, setSavingAdjustment] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const load = React.useCallback(async () => {
    try {
      const [people, payments, history] = await Promise.all([
        window.payroll.employees.list({ status: 'All' }),
        window.payroll.advances.list(),
        window.payroll.advances.history()
      ]);
      setEmployees(people);
      setAdvances(payments);
      setAdjustments(history);
    } catch (error) { notify(error.message, 'error'); }
  }, [notify]);
  React.useEffect(() => { load(); }, [load]);
  const setField = (field) => (event) => setForm((value) => ({ ...value, [field]: event.target.value }));
  const setAdjustmentField = (field) => (event) => setAdjustment((value) => ({ ...value, [field]: event.target.value }));
  const outstanding = advances.reduce((sum, item) => sum + item.outstanding_paise, 0);
  const total = advances.reduce((sum, item) => sum + item.amount_paise, 0);
  const duplicatePayment = advances.some((item) => item.employee_id === Number(form.employee_id)
    && item.payment_date === form.payment_date);
  const submit = async () => {
    if (duplicatePayment) {
      notify('A weekly payment is already recorded for this labourer on this date', 'error');
      return;
    }
    setSaving(true);
    try {
      await window.payroll.advances.create({
        ...form, employee_id: Number(form.employee_id), amount_paise: paiseFromRupees(form.amount)
      });
      notify('Weekly payment recorded. It will be deducted from the next labour bill.');
      setOpen(false);
      setForm(initialForm);
      load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };
  const submitAdjustment = async () => {
    setSavingAdjustment(true);
    try {
      await window.payroll.advances.adjust({
        advance_payment_id: adjustmentAdvance.id,
        direction: adjustment.direction,
        amount_paise: paiseFromRupees(adjustment.amount),
        reason: adjustment.reason
      });
      notify('Weekly payment balance corrected');
      setAdjustmentAdvance(null);
      setAdjustment(initialAdjustment);
      load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSavingAdjustment(false); }
  };
  return <>
    <ScreenHeader title="Weekly payments" subtitle="Record money already paid to each labourer. It will be deducted automatically when you make a labour bill." actionLabel="Record weekly payment" onAction={() => setOpen(true)} icon={AddOutlined} />
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6}><Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}><CardContent>
        <Stack direction="row" justifyContent="space-between"><Box><Typography variant="body2" color="text.secondary">Payments waiting to be deducted</Typography><Typography variant="h5" sx={{ mt: 1 }}>{rupees(outstanding)}</Typography></Box>
          <AccountBalanceWalletOutlined color="primary" /></Stack></CardContent></Card></Grid>
      <Grid item xs={12} sm={6}><Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}><CardContent>
        <Stack direction="row" justifyContent="space-between"><Box><Typography variant="body2" color="text.secondary">Total weekly payments recorded</Typography><Typography variant="h5" sx={{ mt: 1 }}>{rupees(total)}</Typography></Box>
          <AccountBalanceWalletOutlined color="secondary" /></Stack></CardContent></Card></Grid>
    </Grid>
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Box sx={{ p: 2 }}><Typography fontWeight={700}>Weekly payments</Typography></Box>
      <Box className="page-table-wrap"><Table><TableHead><TableRow><TableCell>Labourer</TableCell><TableCell>Date paid</TableCell><TableCell align="right">Amount paid</TableCell><TableCell align="right">Not yet deducted</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
        <TableBody>{advances.map((item) => <TableRow key={item.id}>
          <TableCell>{item.full_name}<Typography variant="caption" display="block" color="text.secondary">{item.employee_code}</Typography></TableCell>
          <TableCell>{prettyDate(item.payment_date)}</TableCell>
          <TableCell align="right">{rupees(item.amount_paise)}</TableCell>
          <TableCell align="right"><Typography fontWeight={650} color={item.outstanding_paise ? 'warning.main' : 'success.main'}>{rupees(item.outstanding_paise)}</Typography></TableCell>
          <TableCell align="right"><Button size="small" startIcon={<EditOutlined />} onClick={() => {
            setAdjustmentAdvance(item);
            setAdjustment(initialAdjustment);
          }}>Fix amount</Button></TableCell>
        </TableRow>)}
          {!advances.length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>No weekly payments recorded. Select “Record weekly payment” when you pay a labourer.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden', mt: 3 }}>
      <Box sx={{ p: 2 }}><Typography fontWeight={700}>Payments deducted from bills</Typography></Box>
      <Box className="page-table-wrap"><Table size="small"><TableHead><TableRow><TableCell>Transaction</TableCell><TableCell>Employee</TableCell><TableCell>Date</TableCell><TableCell>Type</TableCell><TableCell>Direction</TableCell><TableCell align="right">Amount</TableCell><TableCell>Reason</TableCell></TableRow></TableHead>
        <TableBody>{adjustments.map((item) => <TableRow key={item.transaction_id}>
          <TableCell>{item.transaction_id}</TableCell><TableCell>{item.full_name}</TableCell>
          <TableCell>{new Date(`${item.adjustment_date.replace(' ', 'T')}Z`).toLocaleDateString('en-IN')}</TableCell>
          <TableCell>{item.type}</TableCell><TableCell>{item.direction}</TableCell>
          <TableCell align="right">{rupees(item.amount_paise)}</TableCell><TableCell>{item.reason}</TableCell>
        </TableRow>)}
          {!adjustments.length && <TableRow><TableCell colSpan={7}><Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>After a labour bill is made, the amount deducted appears here.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
    <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Record a weekly payment</DialogTitle>
      <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField select required label="Employee" value={form.employee_id} onChange={setField('employee_id')}>
          {employees.filter((item) => item.status === 'Active').map((item) => <MenuItem key={item.id} value={item.id}>{item.full_name} · {item.employee_code}</MenuItem>)}
        </TextField>
        <Typography variant="body2" color="text.secondary">Enter each amount you have already given this labourer. It will be subtracted from their next labour bill.</Typography>
        {duplicatePayment && <Alert severity="warning">A payment for this labourer is already recorded on this date. Choose a different date.</Alert>}
        <Grid container spacing={2}><Grid item xs={6}><TextField fullWidth required label="Date paid" type="date" InputLabelProps={{ shrink: true }} value={form.payment_date} onChange={setField('payment_date')} /></Grid>
          <Grid item xs={6}><TextField fullWidth required label="Amount paid (₹)" type="number" inputProps={{ min: 0.01, step: '0.01' }} value={form.amount} onChange={setField('amount')} /></Grid></Grid>
        <TextField select label="Payment method" value={form.method} onChange={setField('method')}>
          {['Cash', 'Bank', 'UPI'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
        </TextField>
        <TextField label="Reference number" value={form.reference_number} onChange={setField('reference_number')} />
        <TextField label="Remarks" multiline minRows={2} value={form.remarks} onChange={setField('remarks')} />
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="contained" disabled={saving || duplicatePayment || !form.employee_id || !form.amount || Number(form.amount) <= 0} onClick={submit}>{saving ? 'Saving…' : 'Save weekly payment'}</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(adjustmentAdvance)} onClose={() => setAdjustmentAdvance(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Correct weekly payment</DialogTitle>
      <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary">{adjustmentAdvance?.full_name} · Current outstanding {rupees(adjustmentAdvance?.outstanding_paise || 0)}</Typography>
        <TextField select label="Adjustment" value={adjustment.direction} onChange={setAdjustmentField('direction')}>
          <MenuItem value="Reduce outstanding">Reduce outstanding</MenuItem><MenuItem value="Reinstate outstanding">Reinstate previously reduced amount</MenuItem>
        </TextField>
        <TextField required label="Amount (₹)" type="number" inputProps={{ min: 0.01, step: '0.01' }} value={adjustment.amount} onChange={setAdjustmentField('amount')} />
        <TextField required label="Reason" multiline minRows={2} value={adjustment.reason} onChange={setAdjustmentField('reason')} helperText="This adjustment is permanently added to the transaction history." />
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setAdjustmentAdvance(null)}>Cancel</Button>
        <Button variant="contained" disabled={savingAdjustment || !adjustment.amount || Number(adjustment.amount) <= 0 || adjustment.reason.trim().length < 5} onClick={submitAdjustment}>{savingAdjustment ? 'Saving…' : 'Save adjustment'}</Button></DialogActions>
    </Dialog>
  </>;
}
