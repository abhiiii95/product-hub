'use client';

// Renders one admin-configured category field. Nothing here is category-specific.
export default function CustomFieldInput({ field, value, onChange, error }) {
  const id = `cf-${field.key}`;
  const common = {
    id,
    name: field.key,
    required: field.required,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': field.helpText ? `${id}-help` : undefined,
  };

  let control;
  switch (field.type) {
    case 'textarea':
      control = <textarea {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={5000} />;
      break;
    case 'number':
      control = <input {...common} type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'date':
      control = <input {...common} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'dropdown':
      control = (
        <select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
      break;
    case 'checkbox':
      return (
        <div className="field">
          <label className="checkbox" htmlFor={id}>
            <input id={id} name={field.key} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
            {field.label}
          </label>
          {field.helpText && <div className="hint" id={`${id}-help`}>{field.helpText}</div>}
        </div>
      );
    default:
      control = <input {...common} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={500} />;
  }

  return (
    <div className={field.type === 'textarea' ? 'field span-all' : 'field'}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {control}
      {field.helpText && <div className="hint" id={`${id}-help`}>{field.helpText}</div>}
      {error && <div className="error-text">{error}</div>}
    </div>
  );
}

// Formats a stored custom field value for display.
export function formatCustomValue(field, value) {
  if (field.type === 'checkbox') return value ? 'Yes' : 'No';
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}
