import React from 'react';
import { Box, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { DownloadOutlined, PictureAsPdfOutlined } from '@mui/icons-material';
import { jsPDF } from 'jspdf';
import ScreenHeader from '../components/ScreenHeader.jsx';
import { downloadCsv, prettyDate, rupees, today as getToday } from '../lib/format.js';

const today = getToday();
const monthStart = `${today.slice(0, 8)}01`;
export default function Reports({ notify }) {
  const [report, setReport] = React.useState('salary');
  const [from, setFrom] = React.useState(monthStart);
  const [to, setTo] = React.useState(today);
  const [rows, setRows] = React.useState([]);
  const [employees, setEmployees] = React.useState([]);
  const [employeeId, setEmployeeId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  React.useEffect(() => {
    if (report.startsWith('attendance')) {
      window.payroll.employees.list({ status: 'All' }).then(setEmployees).catch((error) => notify(error.message, 'error'));
    }
  }, [notify, report]);
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (report === 'employees') {
        setRows(await window.payroll.employees.list({ status: 'All' }));
      } else if (report === 'salary') {
        const all = await window.payroll.salaries.list();
        setRows(all.filter((item) => item.period_start >= from && item.period_start <= to));
      } else if (report === 'advances') {
        const all = await window.payroll.advances.list();
        setRows(all.filter((item) => item.payment_date >= from && item.payment_date <= to));
      } else {
        setRows(await window.payroll.attendance.list({
          from, to,
          employee_id: report === 'attendance_employee' && employeeId ? Number(employeeId) : undefined
        }));
      }
    } catch (error) { notify(error.message, 'error'); }
    finally { setLoading(false); }
  }, [employeeId, from, notify, report, to]);
  React.useEffect(() => { load(); }, [load]);
  const headings = report === 'employees'
    ? ['Employee ID', 'Labourer', 'Designation', 'Department', 'Mobile', 'Daily rate', 'Status']
    : report === 'salary'
    ? ['Labourer', 'Period start', 'Period end', 'Hours worked', 'Net payable', 'Paid', 'Status']
      : report === 'advances'
        ? ['Transaction ID', 'Employee', 'Date', 'Method', 'Amount', 'Outstanding']
        : ['Labourer', 'Date', 'Status', 'Hours worked'];
  const values = rows.map((row) => report === 'employees'
    ? [row.employee_code, row.full_name, row.designation, row.department, row.mobile, rupees(row.daily_rate_paise), row.status]
    : report === 'salary'
      ? [row.full_name, row.period_start, row.period_end, JSON.parse(row.attendance_snapshot || '{}').attendanceHours ?? '—', rupees(row.net_paise), rupees(row.paid_paise), row.status]
      : report === 'advances'
        ? [row.transaction_id, row.full_name, row.payment_date, row.method, rupees(row.amount_paise), rupees(row.outstanding_paise)]
        : [row.full_name, row.attendance_date, row.status, row.working_hours]);
  const reportName = report === 'salary' ? 'labour-bill' : report;
  const exportCsv = () => {
    downloadCsv(`${reportName}-report-${from}-to-${to}.csv`, [headings, ...values]);
    notify('Excel-compatible CSV report downloaded');
  };
  const exportPdf = () => {
    const doc = new jsPDF({ orientation: headings.length > 5 ? 'landscape' : 'portrait' });
    doc.setFontSize(16);
    const reportTitle = report === 'salary' ? 'Labour bill' : `${report[0].toUpperCase()}${report.slice(1)}`;
    doc.text(`Pratima Construction · ${reportTitle} report`, 14, 17);
    doc.setFontSize(9);
    doc.text(`${prettyDate(from)} – ${prettyDate(to)} · ${rows.length} records`, 14, 24);
    const margin = 14;
    const usableWidth = doc.internal.pageSize.getWidth() - margin * 2;
    const colWidth = usableWidth / headings.length;
    let y = 35;
    const drawRow = (items, isHeader = false) => {
      if (y > doc.internal.pageSize.getHeight() - 15) { doc.addPage(); y = 18; }
      if (isHeader) { doc.setFillColor(238, 242, 248); doc.rect(margin, y - 5, usableWidth, 8, 'F'); }
      doc.setFont('helvetica', isHeader ? 'bold' : 'normal');
      doc.setFontSize(8);
      items.forEach((value, index) => doc.text(String(value ?? '').slice(0, 27), margin + index * colWidth, y, { maxWidth: colWidth - 2 }));
      y += isHeader ? 11 : 9;
    };
    drawRow(headings, true);
    values.forEach((row) => drawRow(row));
    doc.save(`${reportName}-report-${from}-to-${to}.pdf`);
    notify('PDF report saved');
  };
  return <>
    <ScreenHeader title="Reports" subtitle="Filter labour, attendance, wage bills and advance payment records for export." />
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} alignItems={{ lg: 'center' }} spacing={1.5} sx={{ p: 2 }}>
        <TextField select size="small" label="Report type" value={report} onChange={(event) => {
          const value = event.target.value;
          setReport(value);
          if (value === 'attendance_daily') { setFrom(today); setTo(today); }
          if (value === 'attendance_monthly') { setFrom(monthStart); setTo(today); }
        }} sx={{ minWidth: 200 }}>
          <MenuItem value="employees">Employee list</MenuItem><MenuItem value="attendance_daily">Daily attendance</MenuItem>
          <MenuItem value="attendance_monthly">Monthly attendance</MenuItem><MenuItem value="attendance_employee">Employee-wise attendance</MenuItem>
          <MenuItem value="salary">Labour bill report</MenuItem><MenuItem value="advances">Advance payments</MenuItem>
        </TextField>
        {report !== 'employees' && <>
          <TextField size="small" label="From" type="date" InputLabelProps={{ shrink: true }} value={from} onChange={(event) => setFrom(event.target.value)} />
          <TextField size="small" label="To" type="date" InputLabelProps={{ shrink: true }} value={to} onChange={(event) => setTo(event.target.value)} />
        </>}
        {report === 'attendance_employee' && <TextField select size="small" label="Employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} sx={{ minWidth: 200 }}>
          <MenuItem value="">All employees</MenuItem>{employees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.full_name}</MenuItem>)}
        </TextField>}
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" startIcon={<PictureAsPdfOutlined />} onClick={exportPdf} disabled={!rows.length}>Export PDF</Button>
        <Button variant="contained" startIcon={<DownloadOutlined />} onClick={exportCsv} disabled={!rows.length}>Export Excel / CSV</Button>
      </Stack>
      <Box className="page-table-wrap"><Table size="small"><TableHead><TableRow>{headings.map((heading) => <TableCell key={heading}>{heading}</TableCell>)}</TableRow></TableHead>
        <TableBody>{values.map((row, index) => <TableRow key={`${index}-${rows[index]?.id || rows[index]?.transaction_id}`}>{row.map((value, cell) => <TableCell key={`${index}-${cell}`}>{value}</TableCell>)}</TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={headings.length}><Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>{loading ? 'Loading report…' : 'No records match the selected filters.'}</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
  </>;
}
