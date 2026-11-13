import React from 'react';
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
  IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField,
  Tooltip, Typography
} from '@mui/material';
import { AddOutlined, AccountBalanceWalletOutlined, ChevronLeftOutlined, ChevronRightOutlined, EditOutlined } from '@mui/icons-material';
import ScreenHeader from '../components/ScreenHeader.jsx';
import { paiseFromRupees, prettyDate, rupees, today } from '../lib/format.js';

const initialForm = { employee_id: '', payment_date: today(), amount: '', method: 'Cash', reference_number: '', remarks: '' };
const shiftMonth = (value, offset) => {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

export default function Advances({ notify }) {
  const [employees, setEmployees] = React.useState([]);
  const [advances, setAdvances] = React.useState([]);
  const [adjustments, setAdjustments] = React.useState([]);
  const [month, setMonth] = React.useState(today().slice(0, 7));
  const [selectedWeek, setSelectedWeek] = React.useState('all');
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState(initialForm);
  const [editingAdvanceId, setEditingAdvanceId] = React.useState(null);
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
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const weekStart = selectedWeek === 'all' ? 1 : (Number(selectedWeek) - 1) * 7 + 1;
  const weekEnd = selectedWeek === 'all' ? daysInMonth : Math.min(weekStart + 6, daysInMonth);
  const periodStart = `${month}-${String(weekStart).padStart(2, '0')}`;
  const periodEnd = `${month}-${String(weekEnd).padStart(2, '0')}`;
  const periodAdvances = advances.filter((item) => item.payment_date >= periodStart && item.payment_date <= periodEnd);
  const periodAdjustments = adjustments.filter((item) => {
    const adjustmentDate = item.adjustment_date.slice(0, 10);
    return adjustmentDate >= periodStart && adjustmentDate <= periodEnd;
  });
  const outstanding = advances.reduce((sum, item) => sum + item.outstanding_paise, 0);
  const total = periodAdvances.reduce((sum, item) => sum + item.amount_paise, 0);
  const currentMonth = today().slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T00:00:00`));
  const duplicatePayment = advances.some((item) => item.employee_id === Number(form.employee_id)
    && item.payment_date === form.payment_date && item.id !== editingAdvanceId);
  const openNew = () => {
    setEditingAdvanceId(null);
    setForm({ ...initialForm, payment_date: today() });
    setOpen(true);
  };
  const openEdit = (item) => {
    setEditingAdvanceId(item.id);
    setForm({
      employee_id: String(item.employee_id),
      payment_date: item.payment_date,
      amount: (item.amount_paise / 100).toFixed(2),
      method: item.method,
      reference_number: item.reference_number || '',
      remarks: item.remarks || ''
    });
    setOpen(true);
  };
  const closePaymentDialog = () => {
    setOpen(false);
    setEditingAdvanceId(null);
    setForm({ ...initialForm, payment_date: today() });
  };
  const submit = async () => {
    if (duplicatePayment) {
      notify('A weekly payment is already recorded for this labourer on this date', 'error');
      return;
    }
    setSaving(true);
    try {
      const payment = {
        ...form, employee_id: Number(form.employee_id), amount_paise: paiseFromRupees(form.amount)
      };
      if (editingAdvanceId) {
        await window.payroll.advances.update({ ...payment, id: editingAdvanceId });
        notify('Weekly payment updated');
      } else {
        await window.payroll.advances.create(payment);
        notify('Weekly payment recorded. It will be deducted from the next labour bill.');
      }
      closePaymentDialog();
      await load();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };
  return <>
    <ScreenHeader title="Weekly payments" subtitle="Record money already paid to each labourer. It will be deducted automatically when you make a labour bill." actionLabel="Record weekly payment" onAction={openNew} icon={AddOutlined} />
    <Grid container spacing={2} sx={{ mb: 3 }}>
      <Grid item xs={12} sm={6}><Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}><CardContent>
        <Stack direction="row" justifyContent="space-between"><Box><Typography variant="body2" color="text.secondary">Payments waiting to be deducted</Typography><Typography variant="h5" sx={{ mt: 1 }}>{rupees(outstanding)}</Typography></Box>
          <AccountBalanceWalletOutlined color="primary" /></Stack></CardContent></Card></Grid>
      <Grid item xs={12} sm={6}><Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}><CardContent>
        <Stack direction="row" justifyContent="space-between"><Box><Typography variant="body2" color="text.secondary">Payments recorded in selected period</Typography><Typography variant="h5" sx={{ mt: 1 }}>{rupees(total)}</Typography></Box>
          <AccountBalanceWalletOutlined color="secondary" /></Stack></CardContent></Card></Grid>
    </Grid>
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} justifyContent="space-between" sx={{ p: 2 }}>
        <Box><Typography fontWeight={700}>Weekly payments</Typography><Typography variant="caption" color="text.secondary">{periodStart === periodEnd ? prettyDate(periodStart) : `${prettyDate(periodStart)} – ${prettyDate(periodEnd)}`}</Typography></Box>
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title="Previous month"><span><IconButton size="small" aria-label="Previous month" onClick={() => { setMonth((value) => shiftMonth(value, -1)); setSelectedWeek('all'); }}><ChevronLeftOutlined /></IconButton></span></Tooltip>
          <Typography variant="body2" fontWeight={650} sx={{ minWidth: 120, textAlign: 'center' }}>{monthLabel}</Typography>
          <Tooltip title="Next month"><span><IconButton size="small" aria-label="Next month" disabled={month >= currentMonth} onClick={() => { setMonth((value) => shiftMonth(value, 1)); setSelectedWeek('all'); }}><ChevronRightOutlined /></IconButton></span></Tooltip>
          <TextField size="small" select label="Week" value={selectedWeek} onChange={(event) => setSelectedWeek(event.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="all">All weeks</MenuItem>
            {Array.from({ length: Math.ceil(daysInMonth / 7) }, (_value, index) => {
              const start = index * 7 + 1;
              const end = Math.min(start + 6, daysInMonth);
              return <MenuItem key={index + 1} value={String(index + 1)}>Week {index + 1} ({start}–{end})</MenuItem>;
            })}
          </TextField>
        </Stack>
      </Stack>
      <Box className="page-table-wrap"><Table><TableHead><TableRow><TableCell>Labourer</TableCell><TableCell>Date paid</TableCell><TableCell align="right">Amount paid</TableCell><TableCell align="right">Not yet deducted</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
        <TableBody>{periodAdvances.map((item) => <TableRow key={item.id}>
          <TableCell>{item.full_name}<Typography variant="caption" display="block" color="text.secondary">{item.employee_code}</Typography></TableCell>
          <TableCell>{prettyDate(item.payment_date)}</TableCell>
          <TableCell align="right">{rupees(item.amount_paise)}</TableCell>
          <TableCell align="right"><Typography fontWeight={650} color={item.outstanding_paise ? 'warning.main' : 'success.main'}>{rupees(item.outstanding_paise)}</Typography></TableCell>
          <TableCell align="right">
            <Tooltip title="Edit payment details"><IconButton size="small" aria-label={`Edit payment for ${item.full_name}`} onClick={() => openEdit(item)}>
              <EditOutlined fontSize="small" />
            </IconButton></Tooltip>
          </TableCell>
        </TableRow>)}
          {!periodAdvances.length && <TableRow><TableCell colSpan={5}><Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>{advances.length ? 'No weekly payments recorded for this period.' : 'No weekly payments recorded. Select “Record weekly payment” when you pay a labourer.'}</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden', mt: 3 }}>
      <Box sx={{ p: 2 }}><Typography fontWeight={700}>Payments deducted from bills</Typography><Typography variant="caption" color="text.secondary">Filtered to the selected period</Typography></Box>
      <Box className="page-table-wrap"><Table size="small"><TableHead><TableRow><TableCell>Transaction</TableCell><TableCell>Employee</TableCell><TableCell>Date</TableCell><TableCell>Type</TableCell><TableCell>Direction</TableCell><TableCell align="right">Amount</TableCell><TableCell>Reason</TableCell></TableRow></TableHead>
        <TableBody>{periodAdjustments.map((item) => <TableRow key={item.transaction_id}>
          <TableCell>{item.transaction_id}</TableCell><TableCell>{item.full_name}</TableCell>
          <TableCell>{new Date(`${item.adjustment_date.replace(' ', 'T')}Z`).toLocaleDateString('en-IN')}</TableCell>
          <TableCell>{item.type}</TableCell><TableCell>{item.direction}</TableCell>
          <TableCell align="right">{rupees(item.amount_paise)}</TableCell><TableCell>{item.reason}</TableCell>
        </TableRow>)}
          {!periodAdjustments.length && <TableRow><TableCell colSpan={7}><Typography color="text.secondary" textAlign="center" sx={{ py: 4 }}>{adjustments.length ? 'No deductions or adjustments recorded for this period.' : 'After a labour bill is made, the amount deducted appears here.'}</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
    <Dialog open={open} onClose={closePaymentDialog} maxWidth="sm" fullWidth>
      <DialogTitle>{editingAdvanceId ? 'Edit weekly payment' : 'Record a weekly payment'}</DialogTitle>
      <DialogContent dividers><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField select required label="Employee" value={form.employee_id} onChange={setField('employee_id')} disabled={Boolean(editingAdvanceId)}>
          {employees.filter((item) => item.status === 'Active' || item.id === Number(form.employee_id)).map((item) => <MenuItem key={item.id} value={item.id}>{item.full_name} · {item.employee_code}</MenuItem>)}
        </TextField>
        <Typography variant="body2" color="text.secondary">
          {editingAdvanceId
            ? 'Update the recorded payment details. Amounts already deducted from bills cannot be reduced.'
            : 'Enter each amount you have already given this labourer. It will be subtracted from their next labour bill.'}
        </Typography>
        {duplicatePayment && <Alert severity="warning">A payment for this labourer is already recorded on this date. Choose a different date.</Alert>}
        <Grid container spacing={2}><Grid item xs={6}><TextField fullWidth required label="Date paid" type="date" InputLabelProps={{ shrink: true }} value={form.payment_date} onChange={setField('payment_date')} /></Grid>
          <Grid item xs={6}><TextField fullWidth required label="Amount paid (₹)" type="number" inputProps={{ min: 0.01, step: '0.01' }} value={form.amount} onChange={setField('amount')} /></Grid></Grid>
        <TextField select label="Payment method" value={form.method} onChange={setField('method')}>
          {['Cash', 'Bank', 'UPI'].map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
        </TextField>
        <TextField label="Reference number" value={form.reference_number} onChange={setField('reference_number')} />
        <TextField label="Remarks" multiline minRows={2} value={form.remarks} onChange={setField('remarks')} />
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={closePaymentDialog}>Cancel</Button>
        <Button variant="contained" disabled={saving || duplicatePayment || !form.employee_id || !form.amount || Number(form.amount) <= 0} onClick={submit}>
          {saving ? 'Saving…' : editingAdvanceId ? 'Update weekly payment' : 'Save weekly payment'}
        </Button></DialogActions>
    </Dialog>
  </>;
}
