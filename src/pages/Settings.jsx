import React from 'react';
import {
  Avatar, Box, Button, Card, CardContent, Divider, Grid, Stack, TextField, Typography
} from '@mui/material';
import { BackupOutlined, ImageOutlined, RestoreOutlined, SaveOutlined } from '@mui/icons-material';
import ScreenHeader from '../components/ScreenHeader.jsx';

const defaults = {
  company_name: 'Pratima Construction',
  company_address: '',
  contact: '',
  gstin: '',
  currency: 'INR',
  date_format: 'DD/MM/YYYY',
  financial_year_start: '04-01',
  default_working_days: 26,
  weekly_off_days: 'Sunday',
  company_logo_data: ''
};

export default function Settings({ notify }) {
  const [form, setForm] = React.useState(defaults);
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    window.payroll.settings.get().then((settings) => setForm((current) => ({
      ...current, ...settings,
      default_working_days: Number(settings.default_working_days || current.default_working_days)
    })))
      .catch((error) => notify(error.message, 'error'));
  }, [notify]);
  const setField = (field) => (event) => setForm((current) => ({
    ...current,
    [field]: field === 'default_working_days' ? Number(event.target.value) : event.target.value
  }));
  const save = async () => {
    setSaving(true);
    try { await window.payroll.settings.save(form); notify('Company and payroll settings saved'); }
    catch (error) { notify(error.message, 'error'); }
    finally { setSaving(false); }
  };
  const chooseLogo = async () => {
    try {
      const logo = await window.payroll.settings.selectLogo();
      if (logo) setForm((current) => ({ ...current, company_logo_data: logo }));
    } catch (error) { notify(error.message, 'error'); }
  };
  const backup = async () => {
    setBusy(true);
    try {
      const result = await window.payroll.backup();
      if (result) notify('Database backup saved');
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    if (!window.confirm('Restoring replaces the current labourer, attendance, wage bill and payment records. Make sure you have a recent backup. Continue?')) return;
    setBusy(true);
    try {
      const result = await window.payroll.restore();
      if (result) {
        notify('Database restored successfully');
        const settings = await window.payroll.settings.get();
        setForm((current) => ({ ...current, ...settings, default_working_days: Number(settings.default_working_days || current.default_working_days) }));
      }
    } catch (error) { notify(error.message, 'error'); }
    finally { setBusy(false); }
  };
  return <>
    <ScreenHeader title="Settings" subtitle="Configure company details and local database backups." />
    <Grid container spacing={2.5}>
      <Grid item xs={12} lg={8}>
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h6">Company information</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>These details are included on generated wage statements.</Typography>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2.5 }}>
              <Avatar variant="rounded" src={form.company_logo_data || undefined} sx={{ width: 64, height: 64, bgcolor: 'action.hover' }}>
                {!form.company_logo_data && <ImageOutlined color="disabled" />}
              </Avatar>
              <Box><Button variant="outlined" startIcon={<ImageOutlined />} onClick={chooseLogo}>Choose company logo</Button>
                <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>PNG or JPG, up to 5 MB</Typography></Box>
            </Stack>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}><TextField fullWidth required label="Company name" value={form.company_name} onChange={setField('company_name')} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Contact information" value={form.contact} onChange={setField('contact')} /></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="GSTIN" inputProps={{ maxLength: 15 }} value={form.gstin} onChange={setField('gstin')} helperText="Leave blank until your GST number is ready." /></Grid>
              <Grid item xs={12}><TextField fullWidth multiline minRows={2} label="Company address" value={form.company_address} onChange={setField('company_address')} /></Grid>
            </Grid>
            <Divider sx={{ my: 2.5 }} />
            <Typography variant="h6">Payroll and attendance</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>Each labourer's daily rate and attendance hours determine their labour bill. The standard day is 8 hours.</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}><TextField fullWidth select label="Currency" value={form.currency} onChange={setField('currency')} SelectProps={{ native: true }}>
                <option value="INR">Indian Rupee (₹)</option>
              </TextField></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth select label="Date format" value={form.date_format} onChange={setField('date_format')} SelectProps={{ native: true }}>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </TextField></Grid>
              <Grid item xs={12} sm={6}><TextField fullWidth label="Financial year starts (MM-DD)" value={form.financial_year_start} onChange={setField('financial_year_start')} /></Grid>
            </Grid>
            <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.5 }}>
              <Button variant="contained" startIcon={<SaveOutlined />} disabled={saving || !form.company_name} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</Button>
            </Stack>
          </CardContent>
        </Card>
      </Grid>
      <Grid item xs={12} lg={4}>
        <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 2.5 }}>
            <Typography variant="h6">Database backup</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.6 }}>Your database is stored locally in the application's user data directory. Export a copy before moving devices or restoring data.</Typography>
            <Stack spacing={1.5} sx={{ mt: 2.5 }}>
              <Button fullWidth variant="contained" startIcon={<BackupOutlined />} disabled={busy} onClick={backup}>Back up database</Button>
              <Button fullWidth variant="outlined" color="warning" startIcon={<RestoreOutlined />} disabled={busy} onClick={restore}>Restore from backup</Button>
            </Stack>
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 2 }}>Restoring replaces the current database. A temporary recovery copy is created automatically while the restore is in progress.</Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  </>;
}
