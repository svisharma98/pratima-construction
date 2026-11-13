import React from 'react';
import {
  Avatar, Box, Card, CardContent, CircularProgress, Grid, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, Typography
} from '@mui/material';
import {
  AccountBalanceWalletOutlined, Groups2Outlined, PersonOffOutlined, PersonOutline,
  TrendingUpOutlined, PaymentsOutlined
} from '@mui/icons-material';
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import ScreenHeader from '../components/ScreenHeader.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { prettyDate, rupees } from '../lib/format.js';

const colors = ['#2457c5', '#16a085'];

function Metric({ label, value, note, icon: Icon, tone }) {
  return <Card className="metric-card" elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
    <CardContent sx={{ p: '19px !important' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box><Typography variant="body2" color="text.secondary">{label}</Typography>
          <Typography variant="h5" sx={{ mt: 1.2 }}>{value}</Typography>
          {note && <Typography variant="caption" color="text.secondary">{note}</Typography>}</Box>
        <Avatar variant="rounded" sx={{ bgcolor: `${tone}.light`, color: `${tone}.main`, width: 42, height: 42 }}><Icon /></Avatar>
      </Stack>
    </CardContent>
  </Card>;
}

function Panel({ title, subtitle, children, sx }) {
  return <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider', ...sx }}>
    <CardContent sx={{ p: 2.3 }}>
      <Typography fontWeight={700}>{title}</Typography>
      {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      <Box sx={{ mt: 2 }}>{children}</Box>
    </CardContent>
  </Card>;
}

export default function Dashboard({ notify }) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    window.payroll.dashboard().then(setData).catch((error) => notify(error.message, 'error'));
  }, [notify]);
  if (!data) return <Box sx={{ height: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  const attendancePie = [
    { name: 'Present', value: data.attendance.present },
    { name: 'Absent', value: data.attendance.absent }
  ];
  return <>
    <ScreenHeader title="Good day, Administrator" subtitle="Here's the employee and payroll overview for your business." />
    <Grid container spacing={2}>
      <Grid item xs={12} sm={6} xl={2}><Metric label="Total employees" value={data.employees.total} note="All records" icon={Groups2Outlined} tone="primary" /></Grid>
      <Grid item xs={12} sm={6} xl={2}><Metric label="Active employees" value={data.employees.active} note="Currently employed" icon={PersonOutline} tone="success" /></Grid>
      <Grid item xs={12} sm={6} xl={2}><Metric label="Present today" value={data.attendance.present} note="Marked present / half day" icon={TrendingUpOutlined} tone="secondary" /></Grid>
      <Grid item xs={12} sm={6} xl={2}><Metric label="Absent today" value={data.attendance.absent} note="Marked absent" icon={PersonOffOutlined} tone="error" /></Grid>
      <Grid item xs={12} sm={6} xl={2}><Metric label="Month salary expense" value={rupees(data.salary.expense)} note="Processed this month" icon={PaymentsOutlined} tone="primary" /></Grid>
      <Grid item xs={12} sm={6} xl={2}><Metric label="Pending salary" value={rupees(data.salary.pending)} note="Unpaid balance" icon={AccountBalanceWalletOutlined} tone="warning" /></Grid>
      <Grid item xs={12} md={8}>
        <Panel title="Salary expenses" subtitle="Processed payroll by month">
          <Box sx={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.salaryTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `₹${Math.round(value / 100000)}k`} />
                <ChartTooltip formatter={(value) => rupees(value)} />
                <Line type="monotone" dataKey="amount" name="Salary" stroke={colors[0]} strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Panel>
      </Grid>
      <Grid item xs={12} md={4}>
        <Panel title="Attendance overview" subtitle="Today's recorded attendance">
          {attendancePie.every((item) => !item.value) ? <Typography color="text.secondary" variant="body2" sx={{ py: 8, textAlign: 'center' }}>No attendance recorded today</Typography> :
            <Box sx={{ height: 260, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart><Pie data={attendancePie} dataKey="value" innerRadius={66} outerRadius={94} paddingAngle={4}>
                  {attendancePie.map((entry, index) => <Cell key={entry.name} fill={colors[index]} />)}
                </Pie><ChartTooltip /></PieChart>
              </ResponsiveContainer>
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                <Box sx={{ textAlign: 'center' }}><Typography variant="h5">{data.attendance.present + data.attendance.absent}</Typography><Typography variant="caption" color="text.secondary">records</Typography></Box>
              </Box>
              <Stack direction="row" justifyContent="center" spacing={2} sx={{ mt: -1 }}>
                {attendancePie.map((item, index) => <Stack key={item.name} direction="row" spacing={0.7} alignItems="center"><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors[index] }} /><Typography variant="caption">{item.name} · {item.value}</Typography></Stack>)}
              </Stack>
            </Box>}
        </Panel>
      </Grid>
      <Grid item xs={12} md={7}>
        <Panel title="Monthly attendance percentage" subtitle="Present, half day and paid leave attendance">
          <Box sx={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} unit="%" tickLine={false} axisLine={false} />
                <ChartTooltip formatter={(value) => `${value}%`} />
                <Line type="monotone" dataKey="percentage" name="Attendance" stroke={colors[1]} strokeWidth={3} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        </Panel>
      </Grid>
      <Grid item xs={12} md={5}>
        <Panel title="Recent salary transactions" subtitle="Latest processed salary periods">
          {data.recentSalaries.length ? <Box className="page-table-wrap">
            <Table size="small"><TableHead><TableRow><TableCell>Employee</TableCell><TableCell>Period</TableCell><TableCell align="right">Net pay</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
              <TableBody>{data.recentSalaries.map((row) => <TableRow key={row.transaction_id}>
                <TableCell>{row.full_name}</TableCell><TableCell>{prettyDate(row.period_start)}</TableCell>
                <TableCell align="right">{rupees(row.net_paise)}</TableCell><TableCell><StatusChip status={row.status} /></TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </Box> : <Stack alignItems="center" sx={{ py: 5 }}><PersonOffOutlined color="disabled" /><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No salary transactions yet</Typography></Stack>}
        </Panel>
      </Grid>
      <Grid item xs={12}>
        <Panel title="Recent employee activities" subtitle="Latest changes and financial actions">
          {data.recentActivities.length ? <Box className="page-table-wrap">
            <Table size="small"><TableHead><TableRow><TableCell>Activity</TableCell><TableCell>Type</TableCell><TableCell>Details</TableCell><TableCell>Date</TableCell></TableRow></TableHead>
              <TableBody>{data.recentActivities.map((activity) => <TableRow key={activity.id}>
                <TableCell>{activity.action}</TableCell><TableCell>{activity.entity_type}</TableCell>
                <TableCell>{activity.details || '—'}</TableCell><TableCell>{new Date(`${activity.created_at.replace(' ', 'T')}Z`).toLocaleString('en-IN')}</TableCell>
              </TableRow>)}</TableBody>
            </Table>
          </Box> : <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>Employee and payroll activity will appear here.</Typography>}
        </Panel>
      </Grid>
    </Grid>
  </>;
}
