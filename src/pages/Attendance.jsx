import React from 'react';
import {
  Box, Button, Card, CardContent, MenuItem, Paper, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { SaveOutlined } from '@mui/icons-material';
import ScreenHeader from '../components/ScreenHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { prettyDate, rupees, today } from '../lib/format.js';

const statuses = ['Present', 'Absent'];
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
  const [savingId, setSavingId] = React.useState(null);
  const recordMap = React.useMemo(() => new Map(rows.map((row) => [row.employee_id, row])), [rows]);

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
          working_hours: found?.working_hours ?? (found?.status === 'Absent' ? 0 : 8),
          remarks: found?.remarks || ''
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

  const changeRow = (id, field, value) => setRows((current) => current.map((row) => row.employee_id === id ? { ...row, [field]: value } : row));
  const changeStatus = (id, status) => setRows((current) => current.map((row) => row.employee_id === id
    ? { ...row, status, working_hours: status === 'Absent' ? 0 : row.working_hours || 8 }
    : row));
  const save = async (row) => {
    setSavingId(row.employee_id);
    try {
      await window.payroll.attendance.save({
        employee_id: row.employee_id, attendance_date: date, status: row.status,
        working_hours: Number(row.working_hours), remarks: row.remarks
      });
      notify(`Attendance saved for ${row.full_name}`);
      loadMonth();
    } catch (error) { notify(error.message, 'error'); }
    finally { setSavingId(null); }
  };
  const { offset, days } = monthDates(month);
  const monthMap = new Map(monthRows.map((row) => [Number(row.attendance_date.slice(-2)), row]));
  const employeeName = employees.find((item) => item.id === Number(selectedEmployee))?.full_name;

  return <>
    <ScreenHeader title="Daily attendance" subtitle="Mark labour present or absent and enter the actual hours worked. A present day defaults to 8 hours." />
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', mb: 3 }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 2 }}>
          <Typography variant="h6" sx={{ flex: 1 }}>Daily attendance</Typography>
          <TextField size="small" label="Attendance date" type="date" InputLabelProps={{ shrink: true }} value={date} onChange={(event) => setDate(event.target.value)} />
        </Stack>
        <Box className="page-table-wrap"><Table>
          <TableHead><TableRow><TableCell>Labourer / daily rate</TableCell><TableCell>Status</TableCell><TableCell>Hours worked</TableCell><TableCell>Remarks</TableCell><TableCell align="right">Save</TableCell></TableRow></TableHead>
          <TableBody>{rows.map((row) => <TableRow key={row.employee_id}>
            <TableCell><Typography variant="body2" fontWeight={650}>{row.full_name}</Typography><Typography variant="caption" color="text.secondary">{row.employee_code} · {rupees(row.daily_rate_paise)}/day</Typography></TableCell>
            <TableCell><TextField select size="small" value={row.status} onChange={(event) => changeStatus(row.employee_id, event.target.value)} sx={{ minWidth: 120 }}>
              {statuses.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
            </TextField></TableCell>
            <TableCell><TextField size="small" type="number" inputProps={{ min: 0, max: 24, step: 0.25 }} disabled={row.status === 'Absent'} value={row.working_hours} onChange={(event) => changeRow(row.employee_id, 'working_hours', event.target.value)} sx={{ width: 110 }} /></TableCell>
            <TableCell><TextField size="small" placeholder="Optional" value={row.remarks} onChange={(event) => changeRow(row.employee_id, 'remarks', event.target.value)} /></TableCell>
            <TableCell align="right"><Button size="small" variant="contained" startIcon={<SaveOutlined />} disabled={savingId === row.employee_id} onClick={() => save(row)}>{savingId === row.employee_id ? 'Saving' : 'Save'}</Button></TableCell>
          </TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={5}><Typography textAlign="center" color="text.secondary" sx={{ py: 4 }}>No active labourers. Add one to record attendance.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table></Box>
      </CardContent>
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
