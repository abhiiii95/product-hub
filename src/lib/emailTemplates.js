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

// Email clients ignore most CSS, so everything is inline and table-based. Light only:
// dark-mode support in mail apps is unreliable. Colours follow the site's neutral palette.
function layout({ title, preheader, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Inter,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:30px;height:30px;background:#18181b;border-radius:7px;color:#ffffff;font-size:12px;font-weight:700;text-align:center;vertical-align:middle;">PH</td>
<td style="padding-left:10px;font-size:17px;font-weight:600;color:#18181b;">${esc(BRAND)}</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:32px 28px;font-size:15px;line-height:1.6;">
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.6;color:#71717a;">${esc(FOOTER)}<br>You are receiving this email because of your Product Hub account.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function p(html) {
  return `<p style="margin:0 0 16px;">${html}</p>`;
}

function heading(text) {
  return `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:#18181b;">${esc(text)}</h1>`;
}

// rows: [label, value] pairs; values are escaped here. `mono` labels are shown in a code font.
function table(rows, { mono = [] } = {}) {
  const body = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v], i) => {
      const border = i === 0 ? '' : 'border-top:1px solid #e4e4e7;';
      const font = mono.includes(k) ? 'font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;letter-spacing:0.02em;' : '';
      return `<tr><td style="${border}padding:10px 16px 10px 0;color:#71717a;font-size:14px;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="${border}padding:10px 0;font-weight:600;word-break:break-all;${font}">${esc(v)}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;background:#fafafa;border:1px solid #e4e4e7;border-radius:10px;padding:4px 16px;font-size:15px;">${body}</table>`;
}

function textRows(rows) {
  return rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function button(url, label) {
  return `<p style="margin:4px 0 20px;"><a href="${esc(url)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:600;font-size:15px;">${esc(label)}</a></p>`;
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
    ? button(loginUrl, 'Log in to Product Hub') + p(`<span style="font-size:13px;color:#71717a;">Or open this link: <a href="${esc(loginUrl)}" style="color:#18181b;">${esc(loginUrl)}</a></span>`)
    : p('To log in, open the <strong>/login</strong> page on the Product Hub website.');
  const html = layout({
    title: 'Your Product Hub account is ready',
    preheader: 'Your login details are inside.',
    bodyHtml: [
      heading('Your account is ready'),
      p(`Hi ${esc(name)}, welcome to Product Hub. Here are your login details:`),
      table(rows, { mono: ['Temporary password'] }),
      loginHtml,
      `<p style="margin:0 0 16px;padding:12px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:14px;color:#92400e;">Please change your password after you log in for the first time.</p>`,
      endsAt ? p(`Your plan is active until <strong>${esc(endsAt)}</strong>.`) : '',
      p(`If you have any questions, write to ${esc(SUPPORT_EMAIL)}.`),
    ].join('\n'),
  });
  const text = [
    `Hi ${name},`,
    '',
    'Your Product Hub account is ready.',
    '',
    textRows(rows),
    '',
    loginUrl ? `Log in: ${loginUrl}` : 'Log in: open the /login page on the Product Hub website.',
    '',
    'Please change your password after you log in for the first time.',
    endsAt ? `Your plan is active until ${endsAt}.` : '',
    `If you have any questions, write to ${SUPPORT_EMAIL}.`,
    textFooter(),
  ].join('\n');
  return { subject: 'Your Product Hub account is ready', html, text };
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
      heading('Payment received'),
      p(`Hi ${esc(name)}, thank you for your payment. Your Product Hub plan has been extended.`),
      table(rows, { mono: ['Payment ID'] }),
      p('Log in with your existing email and password.'),
      loginUrl ? button(loginUrl, 'Open Product Hub') : '',
      p(`If you have any questions, write to ${esc(SUPPORT_EMAIL)}.`),
    ].join('\n'),
  });
  const text = [
    `Hi ${name},`,
    '',
    'Your Product Hub plan has been extended. Thank you for your payment.',
    '',
    textRows(rows),
    '',
    'Log in with your existing email and password.',
    loginUrl ? `Log in: ${loginUrl}` : '',
    `If you have any questions, write to ${SUPPORT_EMAIL}.`,
    textFooter(),
  ].join('\n');
  return { subject: `Plan extended${endsAt ? ` till ${endsAt}` : ''} - Product Hub`, html, text };
}

function yesNo(v) {
  return v ? 'Yes' : 'No';
}

function ownerMail({ subject, intro, rows }) {
  const html = layout({ title: subject, preheader: intro, bodyHtml: heading(subject) + p(esc(intro)) + table(rows) });
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
