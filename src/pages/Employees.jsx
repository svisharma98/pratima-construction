import React from 'react';
import {
  Alert, Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem,
  Paper, Stack, Table, TableBody, TableCell, TableHead, TablePagination, TableRow,
  TextField, Tooltip, Typography
} from '@mui/material';
import { AddOutlined, EditOutlined, InfoOutlined, PersonOffOutlined, SearchOutlined, PhotoCameraOutlined } from '@mui/icons-material';
import ScreenHeader from '../components/ScreenHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { paiseFromRupees, rupees, today } from '../lib/format.js';

const empty = () => ({
  full_name: '', mobile: '', email: '', address: '', joining_date: today(), profile_photo_data: '',
  designation: '', department: '', employment_type: 'Full-time', status: 'Active',
  emergency_contact: '', government_id: '', daily_rate: ''
});

export default function Employees({ notify }) {
  const [employees, setEmployees] = React.useState([]);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('All');
  const [dialog, setDialog] = React.useState(false);
  const [profile, setProfile] = React.useState(null);
  const [form, setForm] = React.useState(empty);
  const [page, setPage] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const load = React.useCallback(() => window.payroll.employees.list({ search, status: filter }).then(setEmployees)
    .catch((error) => notify(error.message, 'error')), [filter, notify, search]);
  React.useEffect(() => { load(); }, [load]);
  const openNew = () => { setForm(empty()); setDialog(true); };
  const openEdit = (employee) => {
    setForm({
      ...employee,
      email: employee.email || '',
      address: employee.address || '',
      emergency_contact: employee.emergency_contact || '',
      government_id: employee.government_id || '',
      profile_photo_data: employee.profile_photo_data || '',
      daily_rate: employee.daily_rate_paise == null ? '' : (employee.daily_rate_paise / 100).toFixed(2),
      department: employee.department || ''
    });
    setDialog(true);
  };
  const setField = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const choosePhoto = async () => {
    try {
      const photo = await window.payroll.employees.selectPhoto();
      if (photo) setForm((current) => ({ ...current, profile_photo_data: photo }));
    } catch (error) { notify(error.message, 'error'); }
  };
  const submit = async () => {
    setSaving(true);
    try {
      const code = await window.payroll.employees.save({
        ...form, id: form.id || undefined,
        daily_rate_paise: paiseFromRupees(form.daily_rate)
      });
      notify(`${form.id ? 'Employee updated' : `Employee ${code} created`} successfully`);
      setDialog(false);
      load();
    } catch (error) {
      notify(error.message, 'error');
    } finally { setSaving(false); }
  };
  const deactivate = async (employee) => {
    if (!window.confirm(`Deactivate ${employee.full_name}? Existing attendance and labour bills will be retained.`)) return;
    try { await window.payroll.employees.deactivate({ id: employee.id }); notify('Employee deactivated'); load(); }
    catch (error) { notify(error.message, 'error'); }
  };
  const pageRows = employees.slice(page * 10, page * 10 + 10);
  return <>
    <ScreenHeader title="Labourers" subtitle="Manage labour profiles and individual daily wage rates." actionLabel="Add labourer" onAction={openNew} icon={AddOutlined} />
    {employees.some((employee) => employee.daily_rate_needs_review) && <Alert severity="warning" sx={{ mb: 2 }}>
      Existing saved salary amounts need review as daily rates. Edit each affected labourer and save the correct 8-hour daily rate before processing a labour bill.
    </Alert>}
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2 }}>
        <TextField size="small" placeholder="Search name, ID or phone" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }}
          InputProps={{ startAdornment: <SearchOutlined fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} /> }} sx={{ width: { sm: 310 } }} />
        <TextField select size="small" label="Status" value={filter} onChange={(event) => setFilter(event.target.value)} sx={{ width: 150 }}>
          {['All', 'Active', 'Inactive'].map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
        </TextField>
      </Stack>
      <Box className="page-table-wrap"><Table>
        <TableHead><TableRow><TableCell>Labourer</TableCell><TableCell>Role / department</TableCell><TableCell>Phone</TableCell><TableCell>Daily rate</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
        <TableBody>{pageRows.map((employee) => <TableRow key={employee.id} hover>
          <TableCell><Stack direction="row" spacing={1.2} alignItems="center">
            <Avatar src={employee.profile_photo_data || undefined} sx={{ width: 36, height: 36 }}>{employee.full_name?.[0]}</Avatar>
            <Box><Typography fontWeight={650} variant="body2">{employee.full_name}</Typography><Typography variant="caption" color="text.secondary">{employee.employee_code}</Typography></Box>
          </Stack></TableCell>
          <TableCell>{employee.designation}<Typography variant="caption" display="block" color="text.secondary">{employee.department || 'Unassigned'}</Typography></TableCell>
          <TableCell>{employee.mobile}</TableCell>
          <TableCell>{employee.daily_rate_paise == null ? '—' : <>{rupees(employee.daily_rate_paise)} <Typography variant="caption" color="text.secondary">/ day (8h)</Typography></>}</TableCell>
          <TableCell><StatusChip status={employee.status} /></TableCell>
          <TableCell align="right"><Tooltip title="View profile"><IconButton size="small" onClick={() => setProfile(employee)}><InfoOutlined fontSize="small" /></IconButton></Tooltip>
            <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(employee)}><EditOutlined fontSize="small" /></IconButton></Tooltip>
            {employee.status === 'Active' && <Tooltip title="Deactivate"><IconButton size="small" onClick={() => deactivate(employee)}><PersonOffOutlined fontSize="small" /></IconButton></Tooltip>}</TableCell>
        </TableRow>)}
          {!employees.length && <TableRow><TableCell colSpan={6}><Box sx={{ py: 6, textAlign: 'center' }}><Typography color="text.secondary">No employees found. Add an employee to get started.</Typography></Box></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
      <TablePagination component="div" count={employees.length} page={page} onPageChange={(_event, value) => setPage(value)}
        rowsPerPage={10} rowsPerPageOptions={[10]} />
    </Paper>
    <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="md" fullWidth>
      <DialogTitle>{form.id ? 'Edit employee' : 'Add employee'}</DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Avatar src={form.profile_photo_data || undefined} sx={{ width: 58, height: 58 }}>{form.full_name?.[0]}</Avatar>
          <Button variant="outlined" startIcon={<PhotoCameraOutlined />} onClick={choosePhoto}>Choose profile photo</Button>
          {form.profile_photo_data && <Button color="inherit" onClick={() => setForm((current) => ({ ...current, profile_photo_data: '' }))}>Remove</Button>}
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, pt: 1 }}>
        <TextField required label="Full name" value={form.full_name} onChange={setField('full_name')} />
        <TextField required label="Mobile number" value={form.mobile} onChange={setField('mobile')} />
        <TextField label="Email address" type="email" value={form.email} onChange={setField('email')} />
        <TextField required label="Designation" value={form.designation} onChange={setField('designation')} />
        <TextField label="Department" value={form.department} onChange={setField('department')} />
        <TextField required label="Joining date" type="date" InputLabelProps={{ shrink: true }} value={form.joining_date} onChange={setField('joining_date')} />
        <TextField select label="Employment type" value={form.employment_type} onChange={setField('employment_type')}>
          {['Full-time', 'Part-time', 'Contract', 'Daily wage'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        <TextField select label="Status" value={form.status} onChange={setField('status')}>
          {['Active', 'Inactive'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        <TextField required label="Daily rate for 8 hours (₹)" type="number" inputProps={{ min: 0.01, step: '0.01' }} value={form.daily_rate} onChange={setField('daily_rate')} />
        <Typography variant="caption" color="text.secondary" sx={{ gridColumn: { sm: '1 / -1' } }}>
          Hourly pay is calculated as the daily rate ÷ 8. Hours above 8 are paid at the same hourly rate.
        </Typography>
        <TextField label="Emergency contact" value={form.emergency_contact || ''} onChange={setField('emergency_contact')} />
        <TextField label="Government ID" value={form.government_id || ''} onChange={setField('government_id')}
          inputProps={{ autoComplete: 'off' }} />
        <TextField label="Address" multiline minRows={2} value={form.address || ''} onChange={setField('address')} sx={{ gridColumn: { sm: '1 / -1' } }} />
      </Box></DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}><Button onClick={() => setDialog(false)}>Cancel</Button>
        <Button variant="contained" disabled={saving || !form.full_name || !form.mobile || !form.designation || !form.daily_rate || Number(form.daily_rate) <= 0} onClick={submit}>{saving ? 'Saving…' : form.id ? 'Save changes' : 'Create labourer'}</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(profile)} onClose={() => setProfile(null)} maxWidth="sm" fullWidth>
      <DialogTitle>Employee profile</DialogTitle>
      <DialogContent dividers>
        {profile && <>
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
            <Avatar src={profile.profile_photo_data || undefined} sx={{ width: 58, height: 58 }}>{profile.full_name?.[0]}</Avatar>
            <Box><Typography variant="h6">{profile.full_name}</Typography><Typography variant="body2" color="text.secondary">{profile.employee_code}</Typography></Box>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, py: 1 }}>
            {[
            ['Employee ID', profile.employee_code], ['Full name', profile.full_name],
            ['Designation', profile.designation], ['Department', profile.department || 'Unassigned'],
            ['Mobile', profile.mobile], ['Email', profile.email || '—'],
            ['Joining date', profile.joining_date], ['Employment type', profile.employment_type],
            ['Status', profile.status],
            ['Daily rate (8 hours)', rupees(profile.daily_rate_paise)],
            ['Government ID', profile.government_id || '—'],
            ['Emergency contact', profile.emergency_contact || '—'],
            ['Address', profile.address || '—']
            ].map(([label, value]) => <Box key={label}>
              <Typography variant="caption" color="text.secondary">{label}</Typography>
              <Typography variant="body2" fontWeight={600}>{value}</Typography>
            </Box>)}
          </Box>
        </>}
      </DialogContent>
      <DialogActions><Button onClick={() => setProfile(null)}>Close</Button></DialogActions>
    </Dialog>
  </>;
}
