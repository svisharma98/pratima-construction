import { Chip } from '@mui/material';

export default function StatusChip({ status }) {
  const color = status === 'Paid' || status === 'Active' || status === 'Present'
    ? 'success' : status === 'Partially Paid' || status === 'Half Day' || status === 'Paid Leave'
      ? 'warning' : status === 'Inactive' || status === 'Absent' || status === 'Unpaid Leave'
        ? 'error' : 'default';
  return <Chip size="small" label={status} color={color} variant={color === 'default' ? 'outlined' : 'filled'} />;
}
