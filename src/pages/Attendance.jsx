import React from 'react';
import {
  Box, Button, Card, CardContent, Checkbox, Chip, Grid, IconButton, InputAdornment,
  LinearProgress, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Tabs, Tab, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography
} from '@mui/material';
import {
  AccessTimeOutlined, CheckCircleOutline, ChevronLeft, ChevronRight,
  SearchOutlined, SaveOutlined, TodayOutlined
} from '@mui/icons-material';
import ScreenHeader from '../components/ScreenHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { prettyDate, rupees, today } from '../lib/format.js';

const statuses = ['Present', 'Absent'];
const moveDate = (value, amount) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const monthDates = (value) => {
  const [year, month] = value.split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const days = new Date(year, month, 0).getDate();
  return { offset: first.getDay(), days };
};

export default function Attendance({ notify }) {
  const [employees, setEmployees] = React.useState([]);
  const [date, setDate] = React.useState(today());
  const [rows, setRows] = React.useState([]);
  const [month, setMonth] = React.useState(today().slice(0, 7));
  const [selectedEmployee, setSelectedEmployee] = React.useState('');
  const [monthRows, setMonthRows] = React.useState([]);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('All');
  const [savingId, setSavingId] = React.useState(null);
  const [savingAll, setSavingAll] = React.useState(false);
  const [saveProgress, setSaveProgress] = React.useState({ completed: 0, total: 0 });
  const [selectedIds, setSelectedIds] = React.useState([]);

  const loadEmployees = React.useCallback(() => window.payroll.employees.list({ status: 'Active' }).then(setEmployees)
    .catch((error) => notify(error.message, 'error')), [notify]);
  const loadDaily = React.useCallback(async () => {
    try {
      const attendance = await window.payroll.attendance.list({ date });
      setRows(employees.map((employee) => {
        const found = attendance.find((row) => row.employee_id === employee.id);
        return {
          employee_id: employee.id, full_name: employee.full_name, employee_code: employee.employee_code,
          daily_rate_paise: employee.daily_rate_paise,
          status: found?.status || 'Present',
          working_hours: found?.working_hours ?? (found?.status === 'Absent' ? 0 : 12),
          saved: Boolean(found)
        };
      }));
    } catch (error) { notify(error.message, 'error'); }
  }, [date, employees, notify]);
  const loadMonth = React.useCallback(async () => {
    if (!selectedEmployee) { setMonthRows([]); return; }
    const [year, monthNumber] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = `${month}-${String(new Date(year, monthNumber, 0).getDate()).padStart(2, '0')}`;
    try { setMonthRows(await window.payroll.attendance.list({ employee_id: Number(selectedEmployee), from, to })); }
    catch (error) { notify(error.message, 'error'); }
  }, [month, notify, selectedEmployee]);

  React.useEffect(() => { loadEmployees(); }, [loadEmployees]);
  React.useEffect(() => { if (employees.length) loadDaily(); else setRows([]); }, [employees, loadDaily]);
  React.useEffect(() => { loadMonth(); }, [loadMonth]);
  React.useEffect(() => { setSelectedIds([]); }, [date]);

  const changeRow = (id, field, value) => setRows((current) => current.map((row) => row.employee_id === id ? { ...row, [field]: value, saved: false } : row));
  const changeStatus = (id, status) => setRows((current) => current.map((row) => row.employee_id === id
    ? { ...row, status, working_hours: status === 'Absent' ? 0 : row.working_hours || 8, saved: false }
    : row));
  const markSelected = (status) => {
    const selected = new Set(selectedIds);
    setRows((current) => current.map((row) => selected.has(row.employee_id) ? {
      ...row,
      status,
      working_hours: status === 'Absent' ? 0 : row.status === 'Present' ? row.working_hours || 8 : 8,
      saved: false
    } : row));
  };
  const toggleSelected = (id) => setSelectedIds((current) => current.includes(id)
    ? current.filter((selectedId) => selectedId !== id)
    : [...current, id]);
  const save = async (row) => {
    if (savingAll) return;
    const savedDate = date;
    const savedValues = { status: row.status, working_hours: Number(row.working_hours) };
    setSavingId(row.employee_id);
    try {
      await window.payroll.attendance.save({
        employee_id: row.employee_id, attendance_date: savedDate, ...savedValues
      });
      notify(`Attendance saved for ${row.full_name}`);
      setRows((current) => {
        if (date !== savedDate) return current;
        return current.map((item) => item.employee_id === row.employee_id
          && item.status === savedValues.status
          && Number(item.working_hours) === savedValues.working_hours
          ? { ...item, saved: true }
          : item);
      });
      loadMonth();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSavingId(null); }
  };
  const saveRows = async (rowsToSave, successMessage) => {
    if (savingAll || savingId !== null) return;
    const pendingRows = rowsToSave.filter((row) => !row.saved);
    if (!pendingRows.length) return;
    const savedDate = date;
    setSavingAll(true);
    setSaveProgress({ completed: 0, total: pendingRows.length });
    const failed = [];
    const savedIds = [];
    let completed = 0;
    for (const row of pendingRows) {
      const savedValues = {
        status: row.status,
        working_hours: row.status === 'Absent' ? 0 : Number(row.working_hours)
      };
      try {
        await window.payroll.attendance.save({
          employee_id: row.employee_id,
          attendance_date: savedDate,
          ...savedValues
        });
        savedIds.push(row.employee_id);
        setRows((current) => {
          if (date !== savedDate) return current;
          return current.map((item) => item.employee_id === row.employee_id
            && item.status === savedValues.status
            && Number(item.working_hours) === savedValues.working_hours
            ? { ...item, saved: true }
            : item);
        });
      } catch (error) {
        failed.push(`${row.full_name}: ${error.message}`);
      } finally {
        completed += 1;
        setSaveProgress({ completed, total: pendingRows.length });
      }
    }
    if (failed.length) {
      notify(`${pendingRows.length - failed.length} saved; ${failed.length} failed. ${failed.join(' · ')}`, 'error');
    } else {
      notify(successMessage(pendingRows.length));
    }
    setSelectedIds((current) => current.filter((id) => !savedIds.includes(id)));
    if (date === savedDate) loadMonth();
    setSavingAll(false);
  };
  const saveAll = () => saveRows(rows, (count) => `Attendance saved for all ${count} labourers`);
  const saveSelected = () => {
    const selected = new Set(selectedIds);
    saveRows(rows.filter((row) => selected.has(row.employee_id)), (count) => `Attendance saved for ${count} selected labourers`);
  };
  const { offset, days } = monthDates(month);
  const monthMap = new Map(monthRows.map((row) => [Number(row.attendance_date.slice(-2)), row]));
  const employeeName = employees.find((item) => item.id === Number(selectedEmployee))?.full_name;
  const visibleRows = rows.filter((row) => {
    const matchesSearch = `${row.full_name} ${row.employee_code}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'All' || (filter === 'Not saved' ? !row.saved : row.status === filter);
    return matchesSearch && matchesFilter;
  });
  const visibleIds = visibleRows.map((row) => row.employee_id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const toggleVisibleSelection = () => setSelectedIds((current) => allVisibleSelected
    ? current.filter((id) => !visibleIds.includes(id))
    : [...new Set([...current, ...visibleIds])]);
  const presentCount = rows.filter((row) => row.status === 'Present').length;
  const absentCount = rows.filter((row) => row.status === 'Absent').length;
  const savedCount = rows.filter((row) => row.saved).length;
  const totalHours = rows.reduce((sum, row) => sum + (row.status === 'Present' ? Number(row.working_hours) || 0 : 0), 0);
  const estimatedWages = rows.reduce((sum, row) => sum + (row.status === 'Present'
    ? Math.round((row.daily_rate_paise || 0) * (Number(row.working_hours) || 0) / 8)
    : 0), 0);
  const maxAttendanceDate = today();
  const displayDate = new Intl.DateTimeFormat('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(`${date}T00:00:00`));

  return <>
    <ScreenHeader title="Daily attendance" subtitle="Mark labour present or absent and enter the actual hours worked. A present day defaults to 8 hours." />
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3, overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={2}
        sx={{ px: { xs: 2, md: 2.5 }, py: 1.75, bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box>
          <Typography variant="caption" color="text.secondary" fontWeight={700}>ATTENDANCE REGISTER</Typography>
          <Typography variant="body2" fontWeight={600}>{displayDate}</Typography>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Tooltip title="Previous day"><span><IconButton size="small" aria-label="Previous day" disabled={savingAll} onClick={() => setDate((value) => moveDate(value, -1))}><ChevronLeft /></IconButton></span></Tooltip>
          <TextField size="small" type="date" value={date} onChange={(event) => {
            const selectedDate = event.target.value;
            if (selectedDate && selectedDate <= maxAttendanceDate) setDate(selectedDate);
          }}
            inputProps={{ 'aria-label': 'Attendance date', max: maxAttendanceDate }}
            disabled={savingAll} sx={{ width: 165 }} />
          <Tooltip title={date >= maxAttendanceDate ? 'Future attendance is unavailable' : 'Next day'}>
            <span><IconButton size="small" aria-label="Next day" disabled={savingAll || date >= maxAttendanceDate}
              onClick={() => setDate((value) => {
                const nextDate = moveDate(value, 1);
                return nextDate <= maxAttendanceDate ? nextDate : value;
              })}><ChevronRight /></IconButton></span>
          </Tooltip>
          <Button size="small" startIcon={<TodayOutlined />} disabled={savingAll} onClick={() => setDate(today())}>Today</Button>
        </Stack>
      </Stack>
      <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Grid container spacing={1}>
          {[
            { label: 'Present', value: presentCount, color: 'success.main' },
            { label: 'Absent', value: absentCount, color: 'error.main' },
            { label: 'Hours worked', value: totalHours, color: 'primary.main' },
            { label: 'Estimated wages', value: rupees(estimatedWages), color: 'text.primary' },
            { label: 'Saved', value: `${savedCount} / ${rows.length}`, color: 'text.primary' }
          ].map((item) => <Grid item xs={6} sm={2.4} key={item.label}>
            <Typography variant="caption" color="text.secondary" display="block">{item.label}</Typography>
            <Typography fontWeight={700} color={item.color}>{item.value}</Typography>
          </Grid>)}
        </Grid>
      </Box>
      <Box sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ lg: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'center' }}>
            <TextField size="small" placeholder="Search labourers" value={search} onChange={(event) => setSearch(event.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlined fontSize="small" /></InputAdornment> }}
              sx={{ width: { sm: 250 } }} />
            <Tabs value={filter} onChange={(_event, value) => setFilter(value)} aria-label="Filter attendance"
              variant="scrollable" scrollButtons="auto"
              sx={{
                minHeight: 38,
                '& .MuiTab-root': { minHeight: 38, minWidth: 'auto', px: 1.5, textTransform: 'none', fontSize: 13 }
              }}>
              {['All', 'Present', 'Absent', 'Not saved'].map((item) => <Tab value={item} label={item} key={item} />)}
            </Tabs>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            {selectedIds.length > 0 && <>
              <Chip size="small" color="primary" label={`${selectedIds.length} selected`} />
              <Button size="small" disabled={savingAll || savingId !== null} onClick={() => markSelected('Present')}>Mark present</Button>
              <Button size="small" color="error" disabled={savingAll || savingId !== null} onClick={() => markSelected('Absent')}>Mark absent</Button>
              <Button size="small" variant="contained" color="secondary" disabled={savingAll || savingId !== null || !rows.some((row) => selectedIds.includes(row.employee_id) && !row.saved)}
                onClick={saveSelected}>{savingAll ? `Saving ${saveProgress.completed}/${saveProgress.total}…` : 'Save selected'}</Button>
            </>}
            <Button size="small" variant="contained" startIcon={<SaveOutlined />}
              disabled={savingAll || savingId !== null || !rows.some((row) => !row.saved)}
              onClick={saveAll}>{savingAll ? `Saving ${saveProgress.completed}/${saveProgress.total}…` : `Save all (${rows.filter((row) => !row.saved).length})`}</Button>
          </Stack>
        </Stack>
        {savingAll && <LinearProgress variant="determinate" value={saveProgress.total ? saveProgress.completed / saveProgress.total * 100 : 0} sx={{ mb: 1.5, borderRadius: 2 }} />}
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 620 }}>
            <Table stickyHeader size="small" sx={{ minWidth: 900 }}>
              <TableHead><TableRow>
                <TableCell padding="checkbox" sx={{ bgcolor: 'grey.50' }}>
                  <Checkbox size="small" checked={allVisibleSelected}
                    indeterminate={selectedIds.some((id) => !allVisibleSelected && visibleIds.includes(id))}
                    disabled={savingAll || visibleRows.length === 0} onChange={toggleVisibleSelection}
                    inputProps={{ 'aria-label': 'Select visible labourers' }} />
                </TableCell>
                <TableCell sx={{ bgcolor: 'grey.50' }}>Labourer</TableCell>
                <TableCell sx={{ bgcolor: 'grey.50' }}>Attendance</TableCell>
                <TableCell align="center" sx={{ bgcolor: 'grey.50' }}>Hours</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'grey.50' }}>Estimated pay</TableCell>
                <TableCell sx={{ bgcolor: 'grey.50' }}>Record</TableCell>
                <TableCell align="right" sx={{ bgcolor: 'grey.50' }}>Action</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {visibleRows.map((row) => <TableRow key={row.employee_id} hover selected={selectedIds.includes(row.employee_id)}
                  sx={{
                    bgcolor: 'background.paper',
                    '&.Mui-selected': { bgcolor: 'rgba(36,87,197,.09)' },
                    '&.Mui-selected:hover': { bgcolor: 'rgba(36,87,197,.13)' },
                  }}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" checked={selectedIds.includes(row.employee_id)} disabled={savingAll}
                      onChange={() => toggleSelected(row.employee_id)} inputProps={{ 'aria-label': `Select ${row.full_name}` }} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight={650}>{row.full_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.employee_code} · {rupees(row.daily_rate_paise)}/day</Typography>
                  </TableCell>
                  <TableCell>
                    <ToggleButtonGroup size="small" exclusive value={row.status} disabled={savingAll}
                      onChange={(_event, value) => value && changeStatus(row.employee_id, value)}
                      aria-label={`${row.full_name} attendance`}
                      sx={{
                        '& .MuiToggleButton-root': {
                          px: 1.25, py: 0.65, textTransform: 'none', fontSize: 12, fontWeight: 600,
                          borderColor: 'divider', color: 'text.secondary', bgcolor: 'background.paper',
                          '&:hover': { bgcolor: 'action.hover' }
                        },
                        '& .MuiToggleButton-root:first-of-type.Mui-selected': {
                          color: '#fff', bgcolor: 'success.main', borderColor: 'success.main',
                          '&:hover': { bgcolor: 'success.dark', borderColor: 'success.dark' }
                        },
                        '& .MuiToggleButton-root:last-of-type.Mui-selected': {
                          color: '#fff', bgcolor: '#b54747', borderColor: '#b54747',
                          '&:hover': { bgcolor: '#963d3d', borderColor: '#963d3d' }
                        }
                      }}>
                      <ToggleButton value="Present">Present</ToggleButton>
                      <ToggleButton value="Absent">Absent</ToggleButton>
                    </ToggleButtonGroup>
                  </TableCell>
                  <TableCell align="center">
                    <TextField size="small" type="number" inputProps={{ min: 0.25, max: 24, step: 0.25, 'aria-label': `${row.full_name} hours` }}
                      disabled={savingAll || row.status === 'Absent'} value={row.working_hours} onChange={(event) => changeRow(row.employee_id, 'working_hours', event.target.value)}
                      sx={{ width: 86, '& input': { textAlign: 'center', py: 0.9 } }} />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 650 }}>
                    {row.status === 'Present' ? rupees(Math.round((row.daily_rate_paise || 0) * (Number(row.working_hours) || 0) / 8)) : rupees(0)}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={row.saved ? 'success' : 'warning'} variant={row.saved ? 'filled' : 'outlined'}
                      icon={row.saved ? <CheckCircleOutline /> : undefined} label={row.saved ? 'Saved' : 'Not saved'} />
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={row.saved ? 'Save changes' : 'Save attendance'}><span>
                      <IconButton size="small" color="primary" aria-label={`Save attendance for ${row.full_name}`}
                        disabled={savingAll || savingId === row.employee_id} onClick={() => save(row)}>
                        {savingId === row.employee_id ? <AccessTimeOutlined fontSize="small" /> : <SaveOutlined fontSize="small" />}
                      </IconButton>
                    </span></Tooltip>
                  </TableCell>
                </TableRow>)}
                {!visibleRows.length && <TableRow><TableCell colSpan={7}>
                  <Box sx={{ py: 6, textAlign: 'center' }}>
                    <Typography fontWeight={650}>{rows.length ? 'No labourers match this search or filter.' : 'No active labourers yet'}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{rows.length ? 'Try another name or filter.' : 'Add a labourer before recording attendance.'}</Typography>
                  </Box>
                </TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Card>
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
          <Box sx={{ flex: 1 }}><Typography variant="h6">Monthly calendar</Typography><Typography variant="caption" color="text.secondary">{employeeName || 'Choose an employee'} · Select a month to view attendance</Typography></Box>
          <TextField size="small" select label="Employee" value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} sx={{ minWidth: 200 }}>
            <MenuItem value="">Select employee</MenuItem>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.full_name}</MenuItem>)}
          </TextField>
          <TextField size="small" type="month" label="Month" InputLabelProps={{ shrink: true }} value={month} onChange={(event) => setMonth(event.target.value)} />
        </Stack>
        {selectedEmployee ? <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(75px, 1fr))', gap: 1 }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <Typography key={day} variant="caption" textAlign="center" color="text.secondary" fontWeight={700}>{day}</Typography>)}
          {Array.from({ length: offset }, (_value, index) => <Box key={`empty-${index}`} />)}
          {Array.from({ length: days }, (_value, index) => {
            const day = index + 1;
            const record = monthMap.get(day);
            return <Paper key={day} variant="outlined" sx={{ minHeight: 76, p: 1, bgcolor: record?.status === 'Present' ? 'rgba(22,138,99,.08)' : record?.status === 'Absent' ? 'rgba(211,47,47,.08)' : 'background.paper' }}>
              <Typography variant="body2" fontWeight={650}>{day}</Typography>
              {record ? <><StatusChip status={record.status} /><Typography variant="caption" display="block" color="text.secondary">{record.working_hours} hours</Typography></> : <Typography variant="caption" color="text.disabled">No record</Typography>}
            </Paper>;
          })}
        </Box> : <Typography color="text.secondary" sx={{ py: 6, textAlign: 'center' }}>Select an employee to view their monthly attendance calendar.</Typography>}
      </CardContent>
    </Card>
  </>;
}
