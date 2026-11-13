import React from 'react';
import ReactDOM from 'react-dom/client';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import App from './App.jsx';
import './styles.css';

function Root() {
  const [mode, setMode] = React.useState(localStorage.getItem('theme-mode') || 'light');
  const theme = React.useMemo(() => createTheme({
    palette: {
      mode,
      primary: { main: '#2457c5' },
      secondary: { main: '#16a085' },
      background: { default: mode === 'light' ? '#f5f7fb' : '#101522', paper: mode === 'light' ? '#fff' : '#1a2232' },
      success: { main: '#168a63' },
      warning: { main: '#d58a14' }
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
      h4: { fontWeight: 700, letterSpacing: '-0.04em' },
      h5: { fontWeight: 700, letterSpacing: '-0.03em' },
      h6: { fontWeight: 650 },
      button: { textTransform: 'none', fontWeight: 600 }
    },
    components: {
      MuiButton: { styleOverrides: { root: { borderRadius: 9, boxShadow: 'none' } } },
      MuiPaper: { styleOverrides: { rounded: { borderRadius: 14 } } },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 650, color: '#667085', whiteSpace: 'nowrap' } } }
    }
  }), [mode]);
  return <ThemeProvider theme={theme}>
    <CssBaseline />
    <App mode={mode} setMode={(next) => {
      localStorage.setItem('theme-mode', next);
      setMode(next);
    }} />
  </ThemeProvider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
