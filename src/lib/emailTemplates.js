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

// Email clients ignore most CSS, so everything is inline and table-based. The card is
// light (dark mode in mail apps is unreliable); the hero band is dark like the site.
const FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = 'SFMono-Regular,Menlo,Consolas,monospace';
const GREEN = '#16a34a';

// hero: { eyebrow, title, subtitle, big, bigNote } – big is an optional large figure (₹99).
function layout({ title, preheader, hero, bodyHtml }) {
  const bigHtml = hero.big
    ? `<div style="margin:22px 0 0;font-size:56px;line-height:1;font-weight:800;letter-spacing:-0.04em;color:#4ade80;">${esc(hero.big)}</div>${hero.bigNote ? `<div style="margin-top:8px;font-size:14px;color:#a1a1aa;">${esc(hero.bigNote)}</div>` : ''}`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#e4e4e7;font-family:${FONT};color:#18181b;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e4e4e7;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;">
<tr><td style="background:#18181b;padding:28px 32px 36px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="width:34px;height:34px;background:#ffffff;border-radius:9px;color:#18181b;font-size:13px;font-weight:800;text-align:center;vertical-align:middle;">PH</td>
<td style="padding-left:10px;font-size:17px;font-weight:700;color:#ffffff;">${esc(BRAND)}</td>
</tr></table>
${hero.eyebrow ? `<div style="margin:34px 0 0;display:inline-block;background:${GREEN};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:6px 12px;border-radius:999px;">${esc(hero.eyebrow)}</div>` : ''}
<h1 style="margin:${hero.eyebrow ? '16px' : '34px'} 0 0;font-size:36px;line-height:1.12;font-weight:800;letter-spacing:-0.03em;color:#ffffff;">${esc(hero.title)}</h1>
${hero.subtitle ? `<p style="margin:12px 0 0;font-size:17px;line-height:1.5;color:#d4d4d8;">${esc(hero.subtitle)}</p>` : ''}
${bigHtml}
</td></tr>
<tr><td style="padding:32px;font-size:16px;line-height:1.6;">
${bodyHtml}
</td></tr>
<tr><td style="padding:22px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font-size:12px;line-height:1.7;color:#71717a;">
<strong style="color:#18181b;">${esc(BRAND)}</strong> by CaseStores · ${esc(SUPPORT_EMAIL)}<br>You are receiving this email because of your Product Hub account.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function p(html) {
  return `<p style="margin:0 0 18px;">${html}</p>`;
}

function label(text) {
  return `<div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;margin:0 0 8px;">${esc(text)}</div>`;
}

// Large boxed value, e.g. the temporary password.
function bigValue(caption, value, { mono = false, size = 26 } = {}) {
  // Codes may break anywhere; words (emails) only where they must.
  const font = mono ? `font-family:${MONO};letter-spacing:0.06em;word-break:break-all;` : 'letter-spacing:-0.01em;overflow-wrap:anywhere;';
  return `<div style="margin:0 0 14px;padding:18px 20px;border:2px dashed #d4d4d8;border-radius:14px;background:#fafafa;">${label(caption)}<div style="font-size:${size}px;line-height:1.25;font-weight:800;color:#18181b;${font}">${esc(value)}</div></div>`;
}

// Two side-by-side stat boxes; empty values are dropped.
function stats(items) {
  const cells = items.filter(([, v]) => v);
  if (!cells.length) return '';
  const width = Math.floor(100 / cells.length);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr>${cells
    .map(([k, v], i) => `<td width="${width}%" style="${i ? 'padding-left:12px;' : ''}vertical-align:top;"><div style="padding:16px 18px;background:#f4f4f5;border-radius:14px;">${label(k)}<div style="font-size:22px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:#18181b;">${esc(v)}</div></div></td>`)
    .join('')}</tr></table>`;
}

// rows: [label, value] pairs; values are escaped here. `mono` labels are shown in a code font.
function table(rows, { mono = [] } = {}) {
  const body = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v], i) => {
      const border = i === 0 ? '' : 'border-top:1px solid #e4e4e7;';
      const font = mono.includes(k) ? `font-family:${MONO};font-size:15px;letter-spacing:0.02em;` : '';
      return `<tr><td style="${border}padding:12px 16px 12px 0;color:#71717a;font-size:14px;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="${border}padding:12px 0;font-weight:700;font-size:16px;word-break:break-all;${font}">${esc(v)}</td></tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">${body}</table>`;
}

function textRows(rows) {
  return rows
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

function button(url, text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 14px;"><tr><td align="center" style="background:#18181b;border-radius:12px;"><a href="${esc(url)}" style="display:block;padding:18px 24px;color:#ffffff;text-decoration:none;font-size:18px;font-weight:700;">${esc(text)} &rarr;</a></td></tr></table>`;
}

function note(html) {
  return `<p style="margin:0 0 18px;padding:14px 16px;background:#fffbeb;border-left:4px solid #f59e0b;border-radius:8px;font-size:15px;color:#78350f;">${html}</p>`;
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
    ? button(loginUrl, 'Log in to Product Hub') + `<p style="margin:0 0 22px;font-size:13px;color:#71717a;text-align:center;">Or open <a href="${esc(loginUrl)}" style="color:#18181b;">${esc(loginUrl)}</a></p>`
    : p('To log in, open the <strong>/login</strong> page on the Product Hub website.');
  const html = layout({
    title: 'Your Product Hub account is ready',
    preheader: 'Your login details are inside.',
    hero: { eyebrow: 'Welcome aboard', title: `You're in, ${name}.`, subtitle: 'Your reseller account is ready. Log in and start listing today.' },
    bodyHtml: [
      d.email ? bigValue('Your email', d.email, { size: 21 }) : '',
      d.tempPassword ? bigValue('Temporary password', d.tempPassword, { mono: true }) : '',
      `<div style="height:8px;"></div>`,
      stats([['Plan', d.planName], ['Active until', endsAt]]),
      table([['Access', d.accessSummary], ['Support', supportLabel(d.support)]]),
      loginHtml,
      note('<strong>Change your password</strong> after you log in for the first time.'),
      p(`<span style="color:#52525b;">Questions? Just reply or write to <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:#18181b;font-weight:600;">${esc(SUPPORT_EMAIL)}</a>.</span>`),
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
  const amount = d.amountPaise !== undefined ? formatRupees(d.amountPaise) : '';
  const rows = [
    ['Plan', d.planName],
    ['Amount paid', amount],
    ['New plan end date', endsAt],
    ['Access', d.accessSummary],
    ['Payment ID', d.paymentId],
  ];
  const html = layout({
    title: 'Plan extended',
    preheader: endsAt ? `Your plan is now active till ${endsAt}.` : 'Your plan has been extended.',
    hero: { eyebrow: 'Payment received', title: `Thank you, ${name}.`, subtitle: 'Your Product Hub plan has been extended.', big: amount, bigNote: amount ? 'Amount paid' : '' },
    bodyHtml: [
      stats([['Plan', d.planName], ['Active until', endsAt]]),
      table([['Access', d.accessSummary], ['Payment ID', d.paymentId]], { mono: ['Payment ID'] }),
      p('Log in with your existing email and password.'),
      loginUrl ? button(loginUrl, 'Open Product Hub') : '',
      p(`<span style="color:#52525b;">Questions? Write to <a href="mailto:${esc(SUPPORT_EMAIL)}" style="color:#18181b;font-weight:600;">${esc(SUPPORT_EMAIL)}</a>.</span>`),
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

// Owner alerts; `hero` sets the dark band (eyebrow, title, optional big figure).
function ownerMail({ subject, intro, rows, hero }) {
  const html = layout({ title: subject, preheader: intro, hero: { title: subject, ...hero, subtitle: intro }, bodyHtml: table(rows) });
  const text = [intro, '', textRows(rows), textFooter()].join('\n');
  return { subject, html, text };
}

function ownerNewPurchase(d) {
  const couponUsed = Boolean(d.couponCode || d.couponUsed);
  return ownerMail({
    hero: { eyebrow: 'New sale', title: `New purchase: ${d.planName || 'plan'}`, big: formatRupees(d.amountPaise), bigNote: d.name ? `from ${d.name}` : '' },
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
    hero: { eyebrow: 'Action needed', title: 'A payment needs your review' },
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
    hero: { eyebrow: 'Heads up', title: `Coupon over limit${d.couponCode ? `: ${d.couponCode}` : ''}` },
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
