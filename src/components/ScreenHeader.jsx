import { Box, Button, Stack, Typography } from '@mui/material';

export default function ScreenHeader({ title, subtitle, action, actionLabel, onAction, icon: Icon }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} sx={{ mb: 3 }}>
    <Box>
      <Typography variant="h5">{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
    </Box>
    {(action || onAction) && <Button variant="contained" startIcon={Icon && <Icon />} onClick={onAction}>{actionLabel || action}</Button>}
  </Stack>;
}
