// Email templates: render(template, data) -> { subject, html, text }.
// Plain, mobile-friendly HTML with inline CSS, no tracking pixels and no external images.
// Every interpolated value goes through esc(); the text part is built from the same data.

const BRAND = 'Product Hub';
const SUPPORT_EMAIL = 'contact@casestores.in';
const FOOTER = `Product Hub by CaseStores · ${SUPPORT_EMAIL}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// "dd MMM yyyy" in IST. Built from parts so ICU quirks (for example "Sept") never leak in.
export function formatDateIST(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'numeric', year: 'numeric' })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return `${parts.day} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
}

function formatRupees(paise) {
  const n = Number(paise);
  if (!Number.isFinite(n)) return '';
  return `₹${(n / 100).toLocaleString('en-IN', { minimumFractionDigits: n % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

// Only absolute http(s) links are put in an href; anything else is shown as text only.
function safeUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function defaultLoginUrl() {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  return base ? safeUrl(`${base}/login`) : null;
}

function supportLabel(support) {
  return support === 'chat+call' ? 'Chat + call support' : 'Chat support';
}

// ---------- Layout helpers ----------

function layout({ title, preheader, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;">
<tr><td align="center" style="padding:16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;font-size:20px;font-weight:700;color:#111827;">${esc(BRAND)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.6;">
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">${esc(FOOTER)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function p(html) {
  return `<p style="margin:0 0 14px;">${html}</p>`;
}

// rows: [label, value] pairs; values are escaped here.
function table(rows) {
  const body = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:6px 0;font-weight:600;word-break:break-all;">${esc(v)}</td></tr>`)
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;font-size:15px;">${body}</table>`;
}

function textRows(rows) {
  return rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function button(url, label) {
  return `<p style="margin:0 0 18px;"><a href="${esc(url)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;">${esc(label)}</a></p>`;
}

function textFooter() {
  return `\n--\n${FOOTER}`;
}

// ---------- Templates ----------

function welcome(d) {
  const loginUrl = safeUrl(d.loginUrl) || defaultLoginUrl();
  const endsAt = formatDateIST(d.endsAt);
  const name = d.name || 'there';
  const rows = [
    ['Email', d.email],
    ['Temporary password', d.tempPassword],
    ['Plan', d.planName],
    ['Plan end date', endsAt],
    ['Access', d.accessSummary],
    ['Support', supportLabel(d.support)],
  ];
  const loginHtml = loginUrl
    ? button(loginUrl, 'Login to Product Hub') + p(`Login link: <a href="${esc(loginUrl)}" style="color:#2563eb;">${esc(loginUrl)}</a>`)
    : p('Login karne ke liye Product Hub website par <strong>/login</strong> page kholiye.');
  const html = layout({
    title: 'Aapka Product Hub account taiyaar hai',
    preheader: 'Your login details are inside.',
    bodyHtml: [
      p(`Namaste ${esc(name)},`),
      p('<strong>Aapka Product Hub account taiyaar hai.</strong> Your account is ready. Neeche aapki login details hain:'),
      table(rows),
      loginHtml,
      p('<strong>Pehli baar login karne ke baad apna password zaroor badal lijiye.</strong> Please change your password after your first login.'),
      endsAt ? p(`Aapka plan <strong>${esc(endsAt)}</strong> tak active hai.`) : '',
      p(`Koi sawaal ho to ${esc(SUPPORT_EMAIL)} par likhiye.`),
    ].join('\n'),
  });
  const text = [
    `Namaste ${name},`,
    '',
    'Aapka Product Hub account taiyaar hai. Your account is ready.',
    '',
    textRows(rows),
    '',
    loginUrl ? `Login: ${loginUrl}` : 'Login: Product Hub website par /login page kholiye.',
    '',
    'Pehli baar login karne ke baad apna password zaroor badal lijiye. Please change your password after your first login.',
    endsAt ? `Aapka plan ${endsAt} tak active hai.` : '',
    `Koi sawaal ho to ${SUPPORT_EMAIL} par likhiye.`,
    textFooter(),
  ].join('\n');
  return { subject: 'Aapka Product Hub account taiyaar hai', html, text };
}

function receipt(d) {
  const loginUrl = safeUrl(d.loginUrl) || defaultLoginUrl();
  const endsAt = formatDateIST(d.endsAt);
  const name = d.name || 'there';
  const rows = [
    ['Plan', d.planName],
    ['Amount paid', d.amountPaise !== undefined ? formatRupees(d.amountPaise) : ''],
    ['New plan end date', endsAt],
    ['Access', d.accessSummary],
    ['Payment ID', d.paymentId],
  ];
  const html = layout({
    title: 'Plan extended',
    preheader: endsAt ? `Your plan is now active till ${endsAt}.` : 'Your plan has been extended.',
    bodyHtml: [
      p(`Namaste ${esc(name)},`),
      p('<strong>Aapka Product Hub plan extend ho gaya hai.</strong> Thank you for your payment.'),
      table(rows),
      p('Aap apne purane email aur password se hi login kar sakte hain.'),
      loginUrl ? button(loginUrl, 'Open Product Hub') : '',
      p(`Koi sawaal ho to ${esc(SUPPORT_EMAIL)} par likhiye.`),
    ].join('\n'),
  });
  const text = [
    `Namaste ${name},`,
    '',
    'Aapka Product Hub plan extend ho gaya hai. Thank you for your payment.',
    '',
    textRows(rows),
    '',
    'Aap apne purane email aur password se hi login kar sakte hain.',
    loginUrl ? `Login: ${loginUrl}` : '',
    `Koi sawaal ho to ${SUPPORT_EMAIL} par likhiye.`,
    textFooter(),
  ].join('\n');
  return { subject: `Plan extended${endsAt ? ` till ${endsAt}` : ''} - Product Hub`, html, text };
}

function yesNo(v) {
  return v ? 'Yes' : 'No';
}

function ownerMail({ subject, intro, rows }) {
  const html = layout({ title: subject, preheader: intro, bodyHtml: p(esc(intro)) + table(rows) });
  const text = [intro, '', textRows(rows), textFooter()].join('\n');
  return { subject, html, text };
}

function ownerNewPurchase(d) {
  const couponUsed = Boolean(d.couponCode || d.couponUsed);
  return ownerMail({
    subject: `New purchase: ${d.planName || 'plan'} - ${formatRupees(d.amountPaise) || ''}`.replace(/ - $/, ''),
    intro: 'A new Product Hub subscription payment was received.',
    rows: [
      ['Name', d.name],
      ['Email', d.email],
      ['Phone', d.phone],
      ['Plan', d.planName],
      ['Amount', formatRupees(d.amountPaise)],
      ['Coupon used', couponUsed ? `Yes${d.couponCode ? ` (${d.couponCode})` : ''}` : 'No'],
      ['New account', yesNo(d.newAccount)],
      ['Plan ends', formatDateIST(d.endsAt)],
      ['Payment ID', d.paymentId],
    ],
  });
}

function ownerNeedsReview(d) {
  return ownerMail({
    subject: 'Payment needs review - Product Hub',
    intro: 'A payment could not be completed automatically and needs your review.',
    rows: [
      ['Payment ID', d.paymentId],
      ['Email', d.email],
      ['Reason', d.reason],
    ],
  });
}

function ownerCouponOverLimit(d) {
  return ownerMail({
    subject: `Coupon over limit: ${d.couponCode || ''}`.trim(),
    intro: 'A coupon was used more times than its limit allows (the payment was still accepted).',
    rows: [
      ['Coupon', d.couponCode],
      ['Payment ID', d.paymentId],
      ['Email', d.email],
      ['Amount', d.amountPaise !== undefined ? formatRupees(d.amountPaise) : ''],
    ],
  });
}

const TEMPLATES = {
  welcome,
  receipt,
  owner_new_purchase: ownerNewPurchase,
  owner_needs_review: ownerNeedsReview,
  owner_coupon_over_limit: ownerCouponOverLimit,
};

// Templates that need the decrypted temporary password (passed as data.tempPassword).
export const SECRET_TEMPLATES = new Set(['welcome']);

export function hasTemplate(template) {
  return Object.hasOwn(TEMPLATES, template);
}

export function render(template, data = {}) {
  if (!hasTemplate(template)) throw new Error(`Unknown email template: ${String(template).slice(0, 40)}`);
  return TEMPLATES[template](data || {});
}
