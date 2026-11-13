import React from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table,
  TableBody, TableCell, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import { PictureAsPdfOutlined, VisibilityOutlined } from '@mui/icons-material';
import { jsPDF } from 'jspdf';
import ScreenHeader from '../components/ScreenHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { prettyDate, rupees, today } from '../lib/format.js';

const pdfMoney = (paise) => `INR ${(Math.abs(Number(paise) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function loadDefaultLogo() {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Could not prepare the company logo for salary slips'));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => reject(new Error('Could not load the default company logo for salary slips'));
    image.src = new URL('./pratima.png', window.location.href).href;
  });
}

function makeSlip(record, company) {
  const doc = new jsPDF();
  const left = 18;
  const right = 192;
  const attendance = JSON.parse(record.attendance_snapshot || '{}');
  const isLabourBill = Number.isFinite(attendance.earnedPaise);
  const logo = company.company_logo_data;
  const logoFormat = logo?.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  doc.setFillColor(36, 87, 197);
  doc.rect(0, 0, 210, 38, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  if (logo) doc.addImage(logo, logoFormat, left, 7, 17, 17, undefined, 'FAST');
  const companyX = logo ? left + 22 : left;
  doc.text(company.company_name || 'Pratima Construction', companyX, 15, { maxWidth: right - companyX - 55 });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(company.company_address || (isLabourBill ? 'Labour bill' : 'Salary statement'), companyX, 23, { maxWidth: right - companyX - 4 });
  if (company.contact) doc.text(company.contact, companyX, 30, { maxWidth: right - companyX - 4 });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(isLabourBill ? 'WAGE STATEMENT' : 'SALARY SLIP', right, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(record.payment_date ? `Paid: ${prettyDate(record.payment_date)}` : 'Payment pending', right, 29, { align: 'right' });

  const fields = [
    ['Employee name', record.full_name], ['Employee ID', record.employee_code],
    ['Designation', record.designation || '—'],
    ...(isLabourBill
      ? [['Daily rate (8 hours)', pdfMoney(record.basic_paise)]]
      : [['Salary frequency', record.frequency || '—']]),
    ['Period start', prettyDate(record.period_start)], ['Period end', prettyDate(record.period_end)],
    ['Payment date', record.payment_date ? prettyDate(record.payment_date) : 'Pending']
  ];
  fields.forEach(([label, value], index) => {
    const columnX = index % 2 === 0 ? left : 112;
    const lineY = 50 + Math.floor(index / 2) * 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(115, 124, 140);
    doc.text(label, columnX, lineY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(35, 42, 55);
    doc.text(String(value || '—'), columnX, lineY + 5, { maxWidth: 80 });
  });

  const rows = [
    ...(isLabourBill
      ? [[`Wages for ${attendance.attendanceHours || 0} hours`, attendance.earnedPaise]]
      : [['Basic salary', record.basic_paise], ['Unpaid leave deduction', -record.unpaid_deduction_paise]]),
    ['Bonus', record.bonus_paise],
    ...(!isLabourBill ? [['Overtime', record.overtime_paise]] : []),
    ['Allowances', record.allowances_paise],
    ['Other deductions', -record.deductions_paise],
    ['Weekly payments already paid', -record.advance_adjustment_paise],
    [isLabourBill ? 'Gross wages' : 'Gross salary', record.gross_paise],
    ['Net payable', record.net_paise],
    ['Amount paid', record.paid_paise],
    ['Remaining balance', record.net_paise - record.paid_paise]
  ];
  let y = 113;
  doc.setFillColor(242, 245, 250);
  doc.rect(left, y - 6, right - left, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(55, 64, 78);
  doc.text('PAY COMPONENT', left + 2, y);
  doc.text('AMOUNT (INR)', right - 2, y, { align: 'right' });
  y += 10;
  rows.forEach(([label, amount]) => {
    if (label === 'Net payable') {
      doc.setFillColor(232, 239, 251);
      doc.rect(left, y - 5, right - left, 8, 'F');
    }
    doc.setDrawColor(230, 233, 239);
    doc.line(left, y + 3, right, y + 3);
    doc.setFont('helvetica', label === 'Net payable' || label === 'Gross wages' || label === 'Gross salary' ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(45, 54, 68);
    doc.text(label, left + 2, y);
    doc.text(`${amount < 0 ? '- ' : ''}${pdfMoney(amount)}`, right - 2, y, { align: 'right' });
    y += 9;
  });

  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(45, 54, 68);
  doc.text('Attendance summary', left, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(65, 74, 88);
  doc.text(isLabourBill
    ? `Present days: ${attendance.Present || 0}   Absent days: ${attendance.Absent || 0}   Worked hours: ${attendance.attendanceHours || 0}`
    : `Present: ${attendance.Present || 0}   Half day: ${attendance['Half Day'] || 0}   Paid leave: ${attendance['Paid Leave'] || 0}   Unpaid days: ${attendance.unpaidDays || 0}`,
  left, y + 7, { maxWidth: right - left });
  doc.text(`Payment status: ${record.status}`, left, y + 15);
  doc.setTextColor(125, 132, 145);
  doc.setFontSize(8);
  doc.text(`This is a computer-generated ${isLabourBill ? 'wage statement' : 'salary slip'}. Generated ${prettyDate(today())}.`, left, 285);
  const safeEmployeeId = String(record.employee_code || record.employee_id || 'employee').replace(/[^a-zA-Z0-9_-]/g, '-');
  const filename = `${isLabourBill ? 'Wage-Statement' : 'Salary-Slip'}_${safeEmployeeId}_${record.period_start}_to_${record.period_end}.pdf`;
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
  const [preview, setPreview] = React.useState(null);
  React.useEffect(() => {
    if (!preview?.url) return undefined;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview?.url]);
  React.useEffect(() => {
    Promise.all([window.payroll.salaries.list(), window.payroll.settings.get()])
      .then(([salaries, settings]) => {
        setRecords(salaries);
        setCompany(settings);
        if (!settings.company_logo_data) {
          loadDefaultLogo()
            .then((logo) => setCompany((current) => current.company_logo_data ? current : { ...current, company_logo_data: logo }))
            .catch((reason) => setError(reason.message));
        }
      })
      .catch((reason) => setError(reason.message));
  }, []);
  const openPreview = (record) => {
    try {
      const { doc, filename } = makeSlip(record, company);
      setPreview({
        url: URL.createObjectURL(doc.output('blob')),
        filename,
        record
      });
    } catch (reason) {
      setError(reason.message);
    }
  };
  const closePreview = () => setPreview(null);
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
            <Button size="small" startIcon={<VisibilityOutlined />} onClick={() => openPreview(row)}>Preview</Button>
            <Button size="small" startIcon={<PictureAsPdfOutlined />} onClick={() => saveSlip(row, company)}>Save PDF</Button>
            <Button size="small" onClick={() => printSlip(row, company)}>Print</Button>
          </Stack></TableCell>
        </TableRow>)}
          {!filtered.length && <TableRow><TableCell colSpan={7}><Typography color="text.secondary" textAlign="center" sx={{ py: 5 }}>Wage statements will appear here after a labour bill is processed.</Typography></TableCell></TableRow>}
        </TableBody>
      </Table></Box>
    </Paper>
    <Dialog open={Boolean(preview)} onClose={closePreview} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Typography fontWeight={700}>Salary slip preview</Typography>
        {preview && <Typography variant="caption" color="text.secondary">
          {preview.record.full_name} · {preview.record.employee_code} · {prettyDate(preview.record.period_start)} – {prettyDate(preview.record.period_end)}
        </Typography>}
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, bgcolor: 'action.hover' }}>
        {preview && <Box component="iframe" title={`Preview ${preview.filename}`} src={preview.url}
          sx={{ display: 'block', width: '100%', height: { xs: '68vh', md: '76vh' }, border: 0, bgcolor: '#fff' }} />}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.5 }}>
        <Button onClick={closePreview}>Close</Button>
        {preview && <>
          <Button onClick={() => printSlip(preview.record, company)}>Print</Button>
          <Button variant="contained" startIcon={<PictureAsPdfOutlined />} onClick={() => saveSlip(preview.record, company)}>Save PDF</Button>
        </>}
      </DialogActions>
    </Dialog>
  </>;
}
