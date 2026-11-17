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
const calendarDate = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

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
  doc.rect(0, 0, 210, 40, 'F');
  doc.setFillColor(23, 139, 128);
  doc.rect(0, 40, 210, 2, 'F');
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(left, 8, 23, 23, 2, 2, 'F');
    doc.addImage(logo, logoFormat, left + 2, 10, 19, 19, undefined, 'FAST');
  }
  const companyX = logo ? 47 : left;
  fitText(company.company_name || 'Pratima Construction', companyX, 15, 61, 14, 'bold', [255, 255, 255]);
  fitText(company.company_address || 'Construction workforce', companyX, 23, 68, 8, 'normal', [211, 221, 232]);
  if (company.contact) fitText(company.contact, companyX, 30, 68, 8, 'normal', [211, 221, 232]);
  // fitText(`GSTIN: ${company.gstin || 'NOT SET (placeholder)'}`, companyX, 39, 78, 7, 'normal', [211, 221, 232]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(isLabourBill ? 'WAGE STATEMENT' : 'SALARY SLIP', right, 16, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(211, 221, 232);
  doc.text(`GSTIN: ${company.gstin || 'GSTT387648273LPOL9'}`, right, 23, { align: 'right' });

  doc.text(record.payment_date ? `Paid ${prettyDate(record.payment_date)}` : 'Payment pending', right, 31, { align: 'right' });

  sectionLabel('EMPLOYEE DETAILS', left, 52);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 231, 237);
  doc.roundedRect(left, 57, contentWidth, 34, 2, 2, 'FD');
  drawField('Labourer', record.full_name, left + 6, 64, 52);
  drawField('Employee ID', record.employee_code, left + 65, 64, 46);
  drawField('Designation', record.designation, left + 119, 64, 52);
  drawField('Pay frequency', record.frequency, left + 6, 78, 52);
  drawField('Period from', prettyDate(record.period_start), left + 65, 78, 46);
  drawField('Period to', prettyDate(record.period_end), left + 119, 78, 52);

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
  const tableY = 98;
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
  const overtimeHours = Number(attendance.overtimeHours ?? record.current_overtime_hours ?? 0);
  const attendanceItems = isLabourBill
    ? [
      ['PRESENT DAYS', attendance.Present || 0],
      ['ABSENT DAYS', attendance.Absent || 0],
      ['OVERTIME HOURS', overtimeHours],
      ['HOURS WORKED', attendance.attendanceHours || 0]
    ]
    : [
      ['PRESENT DAYS', attendance.Present || 0],
      ['HALF DAYS', attendance['Half Day'] || 0],
      ['PAID LEAVE', attendance['Paid Leave'] || 0]
    ];
  attendanceItems.forEach(([label, value], index) => {
    const columnWidth = contentWidth / attendanceItems.length;
    const x = left + 7 + index * columnWidth;
    sectionLabel(label, x, attendanceTop + 11);
    fitText(String(value), x, attendanceTop + 18, columnWidth - 10, 9, 'bold', [47, 57, 72]);
  });
  if (isLabourBill) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(110, 119, 132);
    doc.text(`Rate note: ${pdfMoney(Number(record.basic_paise) / 8)} per hour · ${pdfMoney(record.basic_paise)} per day (8 hours)`,
      left + 1, attendanceTop + 31);

    const attendanceByDate = new Map((record.attendance_days || attendance.attendanceDays || [])
      .map((item) => [item.date || item.attendance_date, item]));
    const [startYear, startMonth] = record.period_start.split('-').map(Number);
    const [endYear, endMonth] = record.period_end.split('-').map(Number);
    let year = startYear;
    let month = startMonth - 1;
    let firstCalendarPage = true;
    while (year < endYear || (year === endYear && month <= endMonth - 1)) {
      const offset = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const weekRows = Math.ceil((offset + daysInMonth) / 7);
      const cellWidth = contentWidth / 7;
      const compact = firstCalendarPage;
      let cellHeight;
      let gridTop;
      if (compact) {
        firstCalendarPage = false;
        const calendarTop = attendanceTop + 36;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(47, 57, 72);
        doc.text('ATTENDANCE CALENDAR', left, calendarTop);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }), left + 42, calendarTop);
        const legendY = calendarTop - 2;
        doc.setFontSize(5.5);
        doc.setFillColor(220, 241, 233);
        doc.rect(right - 47, legendY - 2, 3, 3, 'F');
        doc.text('Present', right - 43, legendY + 0.5);
        doc.setFillColor(250, 229, 229);
        doc.rect(right - 29, legendY - 2, 3, 3, 'F');
        doc.text('Absent', right - 25, legendY + 0.5);
        doc.setFillColor(194, 231, 211);
        doc.setDrawColor(18, 83, 59);
        doc.rect(right - 12, legendY - 2, 3, 3, 'F');
        doc.text('OT', right - 8, legendY + 0.5);
        gridTop = calendarTop + 6;
        cellHeight = (280 - gridTop) / weekRows;
      } else {
        doc.addPage();
        doc.setFillColor(25, 43, 67);
        doc.rect(0, 0, 210, 31, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text('ATTENDANCE CALENDAR', left, 14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(new Date(year, month, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), left, 23);
        doc.setFontSize(8);
        doc.text('Present', right - 69, 14);
        doc.setFillColor(220, 241, 233);
        doc.rect(right - 79, 10, 7, 6, 'F');
        doc.text('Absent', right - 43, 14);
        doc.setFillColor(250, 229, 229);
        doc.rect(right - 53, 10, 7, 6, 'F');
        doc.text('Overtime', right - 2, 14, { align: 'right' });
        doc.setFillColor(194, 231, 211);
        doc.setDrawColor(18, 83, 59);
        doc.rect(right - 31, 10, 7, 6, 'FD');
        gridTop = 42;
        cellHeight = 24;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(compact ? 6.5 : 8);
      doc.setTextColor(88, 101, 120);
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach((weekday, index) => {
        doc.text(weekday, left + index * cellWidth + cellWidth / 2, gridTop - (compact ? 2 : 5), { align: 'center' });
      });

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = calendarDate(year, month, day);
        const column = (offset + day - 1) % 7;
        const row = Math.floor((offset + day - 1) / 7);
        const x = left + column * cellWidth;
        const y = gridTop + row * cellHeight;
        const inPeriod = date >= record.period_start && date <= record.period_end;
        const item = inPeriod ? attendanceByDate.get(date) : null;
        const workingHours = Number(item?.workingHours ?? item?.working_hours ?? 0);
        const overtime = item?.status === 'Present' && workingHours > 8;
        if (inPeriod) {
          doc.setFillColor(...(overtime ? [194, 231, 211] : item?.status === 'Present' ? [232, 245, 239] : item?.status === 'Absent' ? [252, 238, 238] : [248, 249, 251]));
        } else {
          doc.setFillColor(255, 255, 255);
        }
        doc.setDrawColor(...(overtime ? [18, 83, 59] : [226, 231, 237]));
        const cellInset = compact ? 1.2 : 2;
        doc.roundedRect(x + cellInset, y + cellInset, cellWidth - cellInset * 2,
          cellHeight - cellInset * 2, compact ? 1.2 : 1, compact ? 1.2 : 1, 'FD');
        if (!inPeriod) continue;

        const contentY = y + cellHeight / 2 + (compact ? 1.5 : 2);
        const dateCenterX = x + 6;
        const dividerX = x + 11.5;
        const textColor = overtime ? [18, 83, 59] : [47, 57, 72];
        const dateColor = overtime ? [18, 83, 59] : [23, 139, 128];

        doc.setDrawColor(...dateColor);
        doc.setLineWidth(0.35);
        const dateBadgeHeight = compact ? Math.min(5.5, cellHeight - 3.4) : 6.2;
        const dateBadgeWidth = 7.2;
        const dateBadgeTop = y + (cellHeight - dateBadgeHeight) / 2;
        doc.roundedRect(dateCenterX - dateBadgeWidth / 2, dateBadgeTop, dateBadgeWidth, dateBadgeHeight, 1.1, 1.1, 'S');
        doc.setFont('helvetica', 'bold');
        const dateFontSize = compact ? 7.5 : 8;
        doc.setFontSize(dateFontSize);
        doc.setTextColor(...dateColor);
        const dateTextY = dateBadgeTop + dateBadgeHeight / 2 + dateFontSize * 0.3528 * 0.35;
        doc.text(String(day).padStart(2, '0'), dateCenterX, dateTextY, { align: 'center' });

        doc.setDrawColor(...(overtime ? [125, 185, 153] : [190, 199, 210]));
        doc.setLineWidth(0.25);
        doc.line(dividerX, y + (compact ? 2 : 5), dividerX, y + cellHeight - (compact ? 2 : 5));

        doc.setFont('helvetica', overtime ? 'bold' : 'normal');
        doc.setFontSize(compact ? 7 : 6.5);
        doc.setTextColor(...textColor);
        const hoursLabel = item
          ? `${workingHours} ${workingHours > 1 ? 'Hours' : 'Hour'}`
          : '—';
        const hoursX = dividerX + 2;
        const hoursWidth = x + cellWidth - dividerX - 4.5;
        const hoursFontSize = compact ? 8.5 : 8;
        doc.setFont('helvetica', overtime ? 'bold' : 'normal');
        doc.setFontSize(hoursFontSize);
        while (doc.getTextWidth(hoursLabel) > hoursWidth && doc.getFontSize() > 5.5) {
          doc.setFontSize(doc.getFontSize() - 0.5);
        }
        const hoursTextY = y + cellHeight / 2 + doc.getFontSize() * 0.3528 * 0.35;
        doc.setTextColor(...textColor);
        doc.text(hoursLabel, hoursX, hoursTextY);
      }

      if (!compact) {
        doc.setDrawColor(226, 231, 237);
        doc.line(left, 282, right, 282);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(125, 132, 145);
        fitText(`${record.full_name} · ${prettyDate(record.period_start)} – ${prettyDate(record.period_end)}`,
          left, 286, 132, 7.5, 'normal', [125, 132, 145]);
        doc.text('Pratima Construction', right, 286, { align: 'right' });
      }

      if (month === 11) {
        month = 0;
        year += 1;
      } else {
        month += 1;
      }
    }
  }
  doc.setPage(1);
  doc.setDrawColor(226, 231, 237);
  doc.line(left, 282, right, 282);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(125, 132, 145);
  fitText(`Computer-generated ${isLabourBill ? 'wage statement' : 'salary slip'} · Generated ${prettyDate(today())}`,
    left, 286, 132, 7.5, 'normal', [125, 132, 145]);
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
