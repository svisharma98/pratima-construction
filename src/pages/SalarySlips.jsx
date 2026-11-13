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
  const left = 16;
  const right = 194;
  const contentWidth = right - left;
  const attendance = JSON.parse(record.attendance_snapshot || '{}');
  const isLabourBill = Number.isFinite(attendance.earnedPaise);
  const logo = company.company_logo_data;
  const logoFormat = logo?.startsWith('data:image/png') ? 'PNG' : 'JPEG';
  const fitText = (value, x, y, maxWidth, size = 9, font = 'normal', color = [47, 57, 72]) => {
    const text = String(value || '—');
    doc.setFont('helvetica', font);
    doc.setTextColor(...color);
    let fontSize = size;
    doc.setFontSize(fontSize);
    while (fontSize > 6.5 && doc.getTextWidth(text) > maxWidth) {
      fontSize -= 0.5;
      doc.setFontSize(fontSize);
    }
    doc.text(text, x, y);
  };
  const sectionLabel = (label, x, y) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(88, 101, 120);
    doc.text(label, x, y);
  };
  const drawField = (label, value, x, y, width) => {
    sectionLabel(label.toUpperCase(), x, y);
    fitText(value, x, y + 6, width, 9, 'bold');
  };

  doc.setFillColor(25, 43, 67);
  doc.rect(0, 0, 210, 45, 'F');
  doc.setFillColor(23, 139, 128);
  doc.rect(0, 45, 210, 2, 'F');
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(left, 9, 25, 25, 2, 2, 'F');
    doc.addImage(logo, logoFormat, left + 2, 11, 21, 21, undefined, 'FAST');
  }
  const companyX = logo ? 47 : left;
  fitText(company.company_name || 'Pratima Construction', companyX, 17, 61, 14, 'bold', [255, 255, 255]);
  fitText(company.company_address || 'Construction workforce', companyX, 25, 68, 8, 'normal', [211, 221, 232]);
  if (company.contact) fitText(company.contact, companyX, 32, 68, 8, 'normal', [211, 221, 232]);
  // fitText(`GSTIN: ${company.gstin || 'NOT SET (placeholder)'}`, companyX, 39, 78, 7, 'normal', [211, 221, 232]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(isLabourBill ? 'WAGE STATEMENT' : 'SALARY SLIP', right, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(211, 221, 232);
  doc.text(`GSTIN: ${company.gstin || 'GSTT387648273LPOL9'}`, right, 26, { align: 'right' });

  doc.text(record.payment_date ? `Paid ${prettyDate(record.payment_date)}` : 'Payment pending', right, 34, { align: 'right' });

  doc.setFillColor(239, 247, 246);
  doc.setDrawColor(215, 232, 228);
  doc.roundedRect(left, 55, contentWidth, 37, 2.5, 2.5, 'FD');
  sectionLabel('NET PAYABLE', left + 7, 64);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.setTextColor(23, 109, 101);
  doc.text(pdfMoney(record.net_paise), left + 7, 78);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(88, 101, 120);
  doc.text(`Work period  ${prettyDate(record.period_start)} – ${prettyDate(record.period_end)}`, left + 7, 86);
  doc.setDrawColor(215, 232, 228);
  doc.line(119, 62, 119, 85);
  sectionLabel('PAYMENT STATUS', 126, 65);
  fitText(record.status || 'Pending', 126, 73, 58, 10, 'bold');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(88, 101, 120);
  doc.text(`Paid  ${pdfMoney(record.paid_paise)}`, 126, 80);
  doc.text(`Balance  ${pdfMoney(record.net_paise - record.paid_paise)}`, 126, 87);

  sectionLabel('EMPLOYEE DETAILS', left, 104);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 231, 237);
  doc.roundedRect(left, 109, contentWidth, 40, 2, 2, 'FD');
  drawField('Labourer', record.full_name, left + 6, 118, 52);
  drawField('Employee ID', record.employee_code, left + 65, 118, 46);
  drawField('Designation', record.designation, left + 119, 118, 52);
  drawField(isLabourBill ? 'Daily rate (8 hours)' : 'Pay frequency',
    isLabourBill ? pdfMoney(record.basic_paise) : record.frequency, left + 6, 136, 52);
  drawField('Period from', prettyDate(record.period_start), left + 65, 136, 46);
  drawField('Period to', prettyDate(record.period_end), left + 119, 136, 52);

  const rows = isLabourBill
    ? [
      [`Wages for ${attendance.attendanceHours || 0} hours`, attendance.earnedPaise],
      ['Bonus', record.bonus_paise],
      ['Allowances', record.allowances_paise],
      ['Other deductions', -record.deductions_paise],
      ['Weekly payments already paid', -record.advance_adjustment_paise]
    ]
    : [
      ['Basic salary', record.basic_paise],
      ['Unpaid leave deduction', -record.unpaid_deduction_paise],
      ['Bonus', record.bonus_paise],
      ['Overtime', record.overtime_paise],
      ['Allowances', record.allowances_paise],
      ['Other deductions', -record.deductions_paise],
      ['Weekly payments already paid', -record.advance_adjustment_paise]
    ];
  rows.push(
    [isLabourBill ? 'Gross wages' : 'Gross salary', record.gross_paise, 'total'],
    ['Net payable', record.net_paise, 'net'],
    ['Amount paid', record.paid_paise],
    ['Remaining balance', record.net_paise - record.paid_paise, 'balance']
  );
  const tableY = 160;
  const headerHeight = 9;
  const rowHeight = 7.3;
  doc.setFillColor(35, 54, 79);
  doc.roundedRect(left, tableY, contentWidth, headerHeight, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('PAY COMPONENT', left + 5, tableY + 6);
  doc.text('AMOUNT (INR)', right - 5, tableY + 6, { align: 'right' });
  rows.forEach(([label, amount, emphasis], index) => {
    const rowTop = tableY + headerHeight + index * rowHeight;
    const baseline = rowTop + 5;
    if (emphasis === 'net') {
      doc.setFillColor(235, 245, 243);
      doc.rect(left, rowTop, contentWidth, rowHeight, 'F');
    } else if (index % 2 === 1) {
      doc.setFillColor(248, 249, 251);
      doc.rect(left, rowTop, contentWidth, rowHeight, 'F');
    }
    doc.setFont('helvetica', emphasis ? 'bold' : 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(emphasis === 'net' ? 23 : 47, emphasis === 'net' ? 109 : 57, emphasis === 'net' ? 101 : 72);
    doc.text(label, left + 5, baseline);
    doc.text(`${amount < 0 ? '- ' : ''}${pdfMoney(amount)}`, right - 5, baseline, { align: 'right' });
    doc.setDrawColor(232, 235, 239);
    doc.line(left, rowTop + rowHeight, right, rowTop + rowHeight);
  });
  const attendanceTop = tableY + headerHeight + rows.length * rowHeight + 7;
  sectionLabel('ATTENDANCE SUMMARY', left, attendanceTop);
  doc.setFillColor(247, 249, 251);
  doc.setDrawColor(226, 231, 237);
  doc.roundedRect(left, attendanceTop + 4, contentWidth, 17, 2, 2, 'FD');
  const attendanceItems = isLabourBill
    ? [
      ['PRESENT DAYS', attendance.Present || 0],
      ['ABSENT DAYS', attendance.Absent || 0],
      ['HOURS WORKED', attendance.attendanceHours || 0]
    ]
    : [
      ['PRESENT DAYS', attendance.Present || 0],
      ['HALF DAYS', attendance['Half Day'] || 0],
      ['PAID LEAVE', attendance['Paid Leave'] || 0]
    ];
  attendanceItems.forEach(([label, value], index) => {
    const x = left + 7 + index * 59;
    sectionLabel(label, x, attendanceTop + 11);
    fitText(String(value), x, attendanceTop + 18, 48, 9, 'bold', [47, 57, 72]);
  });
  doc.setDrawColor(226, 231, 237);
  doc.line(left, 282, right, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(125, 132, 145);
  doc.text(`Computer-generated ${isLabourBill ? 'wage statement' : 'salary slip'} · Generated ${prettyDate(today())}`, left, 286);
  doc.text('Pratima Construction', right, 286, { align: 'right' });
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
