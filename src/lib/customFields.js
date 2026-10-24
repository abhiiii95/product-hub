// Formats a stored custom field value for display (shared by client and server).
export function formatCustomValue(field, value) {
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}
