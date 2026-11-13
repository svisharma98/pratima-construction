import React from 'react';
import { Box, Button, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { PictureAsPdfOutlined } from '@mui/icons-material';
import { jsPDF } from 'jspdf';
import ScreenHeader from '../components/ScreenHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { prettyDate, rupees } from '../lib/format.js';

const pdfMoney = (paise) => `INR ${(Math.abs(Number(paise) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function makeSlip(record, company) {
  const doc = new jsPDF();
  const left = 18;
  const attendance = JSON.parse(record.attendance_snapshot || '{}');
  const isLabourBill = Number.isFinite(attendance.earnedPaise);
  doc.setFillColor(36, 87, 197);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  if (company.company_logo_data) {
    const format = company.company_logo_data.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(company.company_logo_data, format, left, 6, 12, 12);
  }
  doc.text(company.company_name || 'Pratima Construction', company.company_logo_data ? left + 16 : left, 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(company.company_address || (isLabourBill ? 'Labour bill' : 'Salary statement'), left, 25);
  doc.text(company.contact || '', left, 31);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(isLabourBill ? 'WAGE STATEMENT' : 'SALARY SLIP', 192, 22, { align: 'right' });

  doc.setTextColor(35, 42, 55);
  doc.setFontSize(10);
  const y0 = 53;
  const fields = [
    ['Employee name', record.full_name], ['Employee ID', record.employee_code],
    ['Designation', record.designation || '—'],
    ...(isLabourBill
      ? [['Daily rate (8 hours)', pdfMoney(record.basic_paise)]]
      : [['Salary frequency', record.frequency]]),
    ['Period start', prettyDate(record.period_start)], ['Period end', prettyDate(record.period_end)],
    ['Payment date', record.payment_date ? prettyDate(record.payment_date) : 'Pending']
  ];
  fields.forEach(([label, value], index) => {
    const columnX = index % 2 === 0 ? left : 112;
    const lineY = y0 + Math.floor(index / 2) * 15;
    doc.setTextColor(115, 124, 140);
    doc.setFont('helvetica', 'normal');
    doc.text(label, columnX, lineY);
    doc.setTextColor(35, 42, 55);
    doc.setFont('helvetica', 'bold');
    doc.text(String(value || '—'), columnX, lineY + 5);
  });

  const rows = [
    ...(isLabourBill
      ? [[`Wages for ${attendance.attendanceHours || 0} hours`, attendance.earnedPaise]]
      : [['Basic salary', record.basic_paise], ['Unpaid leave deduction', -record.unpaid_deduction_paise]]),
    ['Bonus', record.bonus_paise],
    ...(!isLabourBill ? [['Overtime', record.overtime_paise]] : []),
    ['Allowances', record.allowances_paise],
    ['Other deductions', -record.deductions_paise],
    ['Advance adjustment', -record.advance_adjustment_paise],
    [isLabourBill ? 'Gross wages' : 'Gross salary', record.gross_paise],
    ['Net payable', record.net_paise],
    ['Amount paid', record.paid_paise],
    ['Remaining balance', record.net_paise - record.paid_paise]
  ];
  let y = 105;
  doc.setFillColor(242, 245, 250);
  doc.rect(left, y - 6, 174, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.text('PAY COMPONENT', left + 2, y);
  doc.text('AMOUNT (INR)', 190, y, { align: 'right' });
  y += 10;
  rows.forEach(([label, amount]) => {
    doc.setDrawColor(230, 233, 239);
    doc.line(left, y + 3, 192, y + 3);
    doc.setFont('helvetica', label === 'Net payable' ? 'bold' : 'normal');
    doc.setTextColor(45, 54, 68);
    doc.text(label, left + 2, y);
    doc.text(`${amount < 0 ? '- ' : ''}${pdfMoney(amount)}`, 190, y, { align: 'right' });
    y += 9;
  });
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Attendance summary', left, y);
  doc.setFont('helvetica', 'normal');
  doc.text(isLabourBill
    ? `Present days: ${attendance.Present || 0}   Absent days: ${attendance.Absent || 0}   Worked hours: ${attendance.attendanceHours || 0}`
    : `Present: ${attendance.Present || 0}   Half day: ${attendance['Half Day'] || 0}   Paid leave: ${attendance['Paid Leave'] || 0}   Unpaid days: ${attendance.unpaidDays || 0}`,
  left, y + 7);
  doc.text(`Payment status: ${record.status}`, left, y + 15);
  doc.setTextColor(125, 132, 145);
  doc.setFontSize(8);
  doc.text(`This is a computer-generated ${isLabourBill ? 'wage statement' : 'salary slip'}.`, left, 285);
  const filename = `${isLabourBill ? 'Wage-Statement' : 'Salary-Slip'}-${record.employee_code}-${record.period_start}.pdf`;
  return { doc, filename };
}

function saveSlip(record, company) {
  const { doc, filename } = makeSlip(record, company);
  doc.save(filename);
}

function printSlip(record, company) {
  const { doc } = makeSlip(record, company);
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.left = '-10000px';
  frame.src = doc.output('bloburl');
  frame.onload = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  document.body.appendChild(frame);
}

export default function SalarySlips() {
  const [records, setRecords] = React.useState([]);
  const [company, setCompany] = React.useState({});
  const [search, setSearch] = React.useState('');
  const [error, setError] = React.useState('');
  React.useEffect(() => {
    Promise.all([window.payroll.salaries.list(), window.payroll.settings.get()])
      .then(([salaries, settings]) => { setRecords(salaries); setCompany(settings); })
      .catch((reason) => setError(reason.message));
  }, []);
  const filtered = records.filter((row) => `${row.full_name} ${row.employee_code} ${row.period_start}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <ScreenHeader title="Salary slips / wage statements" subtitle="Find a processed labour bill, then save or print its salary slip." />
    <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={2} sx={{ p: 2 }}>
        <Typography fontWeight={700}>Previous wage statements</Typography>
        <TextField size="small" placeholder="Search employee or period" value={search} onChange={(event) => setSearch(event.target.value)} />
      </Stack>
      {error && <Typography color="error" sx={{ px: 2 }}>{error}</Typography>}
      <Box className="page-table-wrap"><Table><TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Period</TableCell><TableCell>Payment status</TableCell><TableCell align="right">Net payable</TableCell><TableCell align="right">Paid</TableCell><TableCell align="right">Remaining</TableCell><TableCell align="right">PDF</TableCell></TableRow></TableHead>
        <TableBody>{filtered.map((row) => <TableRow key={row.id}>
          <TableCell>{row.full_name}<Typography variant="caption" display="block" color="text.secondary">{row.employee_code} · {row.designation}</Typography></TableCell>
          <TableCell>{prettyDate(row.period_start)} – {prettyDate(row.period_end)}</TableCell><TableCell><StatusChip status={row.status} /></TableCell>
          <TableCell align="right">{rupees(row.net_paise)}</TableCell><TableCell align="right">{rupees(row.paid_paise)}</TableCell>
          <TableCell align="right">{rupees(row.net_paise - row.paid_paise)}</TableCell>
          <TableCell align="right"><Stack direction="row" justifyContent="flex-end">
            <Button size="small" startIcon={<PictureAsPdfOutlined />} onClick={() => saveSlip(row, company)}>Save PDF</Button>
            <Button size="small" onClick={() => printSlip(row, company)}>Print</Button>
          </Stack></TableCell>
        </TableRow>)}
          {!filtered.length && <TableRow><TableCell colSpan={7}><Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>Wage statements will appear here after a labour bill is processed.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
  </>;
}
