// Public brand and contact details. Optional fields stay empty until the owner
// fills them in; pages render them only when they are set.
export const SITE = {
  name: 'Product Hub',
  company: 'CaseStores',
  email: 'contact@casestores.in',
  phone: '',
  whatsapp: '',
  address: '',
  gstin: '',
  jurisdictionCity: '',
  grievanceOfficer: { name: '', email: 'contact@casestores.in' },
  effectiveDate: '2026-10-29',
};

// "+91 98xxxxxxxx" style numbers -> digits only, for tel: and wa.me links.
export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function whatsappLink(number) {
  const digits = digitsOnly(number);
  if (!digits) return '';
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

// 29900 -> "₹299", 16633 -> "₹166.33"
export function formatRupees(paise) {
  const value = Number(paise) / 100;
  if (!Number.isFinite(value)) return '';
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

export function formatLongDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}
