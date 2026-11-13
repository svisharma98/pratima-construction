import React, { Suspense } from 'react';
import {
  AppBar, Avatar, Box, CircularProgress, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Snackbar, Toolbar, Tooltip, Typography, useMediaQuery, useTheme
} from '@mui/material';
import {
  AccountBalanceWalletOutlined, AssessmentOutlined, CalendarMonthOutlined, DashboardOutlined,
  Groups2Outlined, Menu as MenuIcon, PaymentsOutlined, SettingsOutlined, Brightness4Outlined,
  Brightness7Outlined, ReceiptLongOutlined, ConstructionOutlined
} from '@mui/icons-material';

const drawerWidth = 250;
const Dashboard = React.lazy(() => import('./pages/Dashboard.jsx'));
const Employees = React.lazy(() => import('./pages/Employees.jsx'));
const Attendance = React.lazy(() => import('./pages/Attendance.jsx'));
const Advances = React.lazy(() => import('./pages/Advances.jsx'));
const Salaries = React.lazy(() => import('./pages/Salaries.jsx'));
const SalarySlips = React.lazy(() => import('./pages/SalarySlips.jsx'));
const Reports = React.lazy(() => import('./pages/Reports.jsx'));
const Settings = React.lazy(() => import('./pages/Settings.jsx'));
const navigation = [
  { key: 'dashboard', title: 'Dashboard', icon: DashboardOutlined },
  { key: 'employees', title: 'Employees', icon: Groups2Outlined },
  { key: 'attendance', title: 'Attendance', icon: CalendarMonthOutlined },
  { key: 'salaries', title: 'Salary Management', icon: PaymentsOutlined },
  { key: 'advances', title: 'Advance Payments', icon: AccountBalanceWalletOutlined },
  { key: 'slips', title: 'Salary Slips', icon: ReceiptLongOutlined },
  { key: 'reports', title: 'Reports', icon: AssessmentOutlined },
  { key: 'settings', title: 'Settings', icon: SettingsOutlined }
];

export default function App({ mode, setMode }) {
  const [active, setActive] = React.useState('dashboard');
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [toast, setToast] = React.useState({ open: false, message: '', severity: 'success' });
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const notify = React.useCallback((message, severity = 'success') => setToast({ open: true, message, severity }), []);

  const pages = {
    dashboard: <Dashboard notify={notify} />,
    employees: <Employees notify={notify} />,
    attendance: <Attendance notify={notify} />,
    salaries: <Salaries notify={notify} />,
    advances: <Advances notify={notify} />,
    slips: <SalarySlips />,
    reports: <Reports notify={notify} />,
    settings: <Settings notify={notify} />
  };

  const sidebar = <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper' }}>
    <Box sx={{ px: 2.5, py: 2.4, display: 'flex', gap: 1.4, alignItems: 'center' }}>
      <Avatar variant="rounded" sx={{ bgcolor: 'primary.main', width: 42, height: 42 }}><ConstructionOutlined /></Avatar>
      <Box><Typography fontWeight={750} fontSize={15}>Pratima Construction</Typography><Typography variant="caption" color="text.secondary">People & Payroll</Typography></Box>
    </Box>
    <Divider sx={{ mx: 2 }} />
    <Typography variant="overline" color="text.secondary" sx={{ pl: 2.5, pt: 2.5, pb: 1, fontWeight: 700, letterSpacing: 1 }}>WORKSPACE</Typography>
    <List sx={{ px: 1.4, py: 0 }}>
      {navigation.map(({ key, title, icon: Icon }) => <ListItemButton
        key={key} selected={active === key} onClick={() => { setActive(key); setMobileOpen(false); }}
        sx={{ minHeight: 44, mb: 0.4, borderRadius: 2, '&.Mui-selected': { bgcolor: 'rgba(36,87,197,.10)', color: 'primary.main' }, '&.Mui-selected:hover': { bgcolor: 'rgba(36,87,197,.14)' } }}>
        <ListItemIcon sx={{ minWidth: 38, color: active === key ? 'primary.main' : 'text.secondary' }}><Icon fontSize="small" /></ListItemIcon>
        <ListItemText primary={title} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active === key ? 650 : 500 }} />
      </ListItemButton>)}
    </List>
    <Box sx={{ flex: 1 }} />
    <Box sx={{ mx: 2, mb: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary">Offline workspace</Typography>
      <Typography variant="body2" fontWeight={600} sx={{ mt: 0.3 }}>Your data stays on this device.</Typography>
    </Box>
  </Box>;

  return <Box sx={{ display: 'flex', minHeight: '100vh' }}>
    <AppBar position="fixed" elevation={0} color="inherit" sx={{
      width: { md: `calc(100% - ${drawerWidth}px)` }, ml: { md: `${drawerWidth}px` },
      borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper'
    }}>
      <Toolbar sx={{ minHeight: '68px !important', px: { xs: 2, md: 3 } }}>
        {isMobile && <IconButton onClick={() => setMobileOpen(true)} edge="start" sx={{ mr: 1 }}><MenuIcon /></IconButton>}
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" fontWeight={700}>{navigation.find((item) => item.key === active)?.title}</Typography>
          <Typography variant="caption" color="text.secondary">Pratima Construction · {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date())}</Typography>
        </Box>
        <Tooltip title={mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          <IconButton onClick={() => setMode(mode === 'light' ? 'dark' : 'light')} size="small">
            {mode === 'light' ? <Brightness4Outlined /> : <Brightness7Outlined />}
          </IconButton>
        </Tooltip>
        <Avatar sx={{ width: 34, height: 34, ml: 1.5, bgcolor: 'secondary.main', fontSize: 13 }}>PC</Avatar>
      </Toolbar>
    </AppBar>
    <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, border: 0 } }}>{sidebar}</Drawer>
      <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box', borderRight: '1px solid', borderColor: 'divider' } }} open>{sidebar}</Drawer>
    </Box>
    <Box component="main" sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, md: 3.5 }, py: 3, mt: '68px' }}>
      <Suspense fallback={<Box sx={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>}>
        {pages[active]}
      </Suspense>
    </Box>
    <Snackbar open={toast.open} autoHideDuration={3500} onClose={() => setToast((value) => ({ ...value, open: false }))}
      message={toast.message} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} />
  </Box>;
}
