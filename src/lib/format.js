export const rupees = (paise = 0) => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 2
}).format((Number(paise) || 0) / 100);

export const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const paiseFromRupees = (value) => Math.round(Number(value || 0) * 100);
export const rupeesFromPaise = (value) => (Number(value || 0) / 100).toFixed(2);
export const prettyDate = (value) => value
  ? new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
  : '—';

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => {
    const value = String(cell ?? '');
    return `"${value.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
