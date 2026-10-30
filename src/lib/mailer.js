import net from 'node:net';
import tls from 'node:tls';
import crypto from 'node:crypto';

// Minimal SMTP client on node:net/node:tls (no npm mail libraries are allowed).
// Supports implicit TLS (465) and STARTTLS (587), AUTH PLAIN/LOGIN, multipart/alternative
// bodies and dot-stuffing. AUTH is never sent over a plain-text socket.

const CONNECT_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 15_000;

export class SmtpError extends Error {
  // code: SMTP reply code (number) or a string such as 'timeout', 'connect', 'tls', 'not_configured'.
  // stage: 'config' | 'connect' | 'auth' | 'message', so callers can tell a server problem from a bad message.
  constructor(reason, { code, permanent = false, stage = 'message' } = {}) {
    super(`SMTP ${code}: ${reason}`);
    this.name = 'SmtpError';
    this.code = code;
    this.permanent = permanent;
    this.stage = stage;
    this.reason = reason;
  }
}

function getConfig() {
  const env = process.env;
  const secureRaw = (env.SMTP_SECURE || '').trim().toLowerCase();
  const portRaw = Number(env.SMTP_PORT);
  let secure;
  if (secureRaw === 'true') secure = true;
  else if (secureRaw === 'false') secure = false;
  else secure = !portRaw || portRaw === 465;
  const port = portRaw || (secure ? 465 : 587);
  return {
    host: (env.SMTP_HOST || '').trim(),
    port,
    secure,
    user: (env.SMTP_USER || '').trim(),
    password: env.SMTP_PASSWORD || '',
    from: (env.MAIL_FROM || '').trim(),
    fromName: cleanHeaderValue(env.MAIL_FROM_NAME || 'Product Hub'),
  };
}

export function isMailConfigured() {
  const c = getConfig();
  return Boolean(c.host && c.user && c.password && c.from && isValidAddress(c.from));
}

// ---------- Addresses and headers ----------

// Strict on purpose: no display names, no <, >, commas, quotes or whitespace, exactly one @.
const ADDRESS_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidAddress(value) {
  return typeof value === 'string' && value.length <= 254 && ADDRESS_RE.test(value);
}

// Removes CR/LF and other control characters so a value can never start a new header line.
export function cleanHeaderValue(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
}

// RFC 2047 encoded-words, each at most 75 chars, split on UTF-8 character boundaries.
export function encodeHeaderValue(value) {
  const clean = cleanHeaderValue(value);
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const words = [];
  let chunk = '';
  for (const ch of clean) {
    // '=?UTF-8?B?' + '?=' is 12 chars, leaving 63 base64 chars = 45 bytes max per word.
    if (Buffer.byteLength(chunk + ch) > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

function formatMailbox(name, address) {
  const clean = cleanHeaderValue(name);
  if (!clean) return `<${address}>`;
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(clean)) return `"${clean.replace(/[\\"]/g, '\\$&')}" <${address}>`;
  return `${encodeHeaderValue(clean)} <${address}>`;
}

function base64Lines(text) {
  const b64 = Buffer.from(String(text ?? ''), 'utf8').toString('base64');
  return b64.match(/.{1,76}/g)?.join('\r\n') || '';
}

function rfc5322Date(date) {
  return date.toUTCString().replace(/GMT$/, '+0000');
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<(br|\/p|\/div|\/tr|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Headers callers must not override (they are built here or would allow extra recipients).
const RESERVED_HEADERS = new Set([
  'from', 'to', 'cc', 'bcc', 'subject', 'date', 'message-id', 'mime-version',
  'content-type', 'content-transfer-encoding', 'reply-to', 'sender', 'return-path',
]);

// Builds the full RFC 5322 message with CRLF line endings (not yet dot-stuffed).
export function buildMessage({ from, fromName, to, subject, html, text, replyTo, headers, date = new Date(), messageId }) {
  if (!isValidAddress(from)) throw new SmtpError('Invalid sender address', { code: 'bad_address', permanent: true });
  if (!isValidAddress(to)) throw new SmtpError('Invalid recipient address', { code: 'bad_address', permanent: true });
  if (replyTo && !isValidAddress(replyTo)) throw new SmtpError('Invalid Reply-To address', { code: 'bad_address', permanent: true });
  if (!html && !text) throw new SmtpError('Message has no body', { code: 'empty_body', permanent: true });

  const domain = from.split('@')[1];
  const id = messageId || `<${crypto.randomBytes(16).toString('hex')}@${domain}>`;
  const lines = [
    `From: ${formatMailbox(fromName, from)}`,
    `To: <${to}>`,
    `Subject: ${encodeHeaderValue(subject || '')}`,
    `Date: ${rfc5322Date(date)}`,
    `Message-ID: ${id}`,
    'MIME-Version: 1.0',
  ];
  if (replyTo) lines.push(`Reply-To: <${replyTo}>`);
  for (const [name, value] of Object.entries(headers || {})) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name) || RESERVED_HEADERS.has(name.toLowerCase())) {
      throw new SmtpError(`Header not allowed: ${cleanHeaderValue(name).slice(0, 40)}`, { code: 'bad_header', permanent: true });
    }
    if (value === undefined || value === null || value === '') continue;
    lines.push(`${name}: ${encodeHeaderValue(value)}`);
  }

  const boundary = `=_ph_${crypto.randomBytes(12).toString('hex')}`;
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`, '');
  const parts = [
    ['text/plain', text || htmlToText(html)],
    ['text/html', html || `<pre>${String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</pre>`],
  ];
  for (const [type, body] of parts) {
    lines.push(
      `--${boundary}`,
      `Content-Type: ${type}; charset=UTF-8`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(body)
    );
  }
  lines.push(`--${boundary}--`, '');
  return { raw: lines.join('\r\n'), messageId: id };
}

// Normalises line endings to CRLF and doubles a leading "." on any line (RFC 5321 4.5.2).
export function dotStuff(raw) {
  return String(raw)
    .replace(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

// ---------- SMTP session ----------

// Keeps server text short and free of anything secret-looking before it goes into errors/logs.
function cleanReason(text, secrets) {
  let out = String(text || '').replace(/\s+/g, ' ').trim();
  for (const s of secrets) {
    if (s && s.length >= 3) out = out.split(s).join('***');
  }
  return out.slice(0, 200) || 'no reply text';
}

class SmtpSession {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.buffer = '';
    this.lines = [];
    this.waiter = null;
    this.alive = false;
    this.capabilities = new Map();
    this.sentCount = 0;
    const pass = config.password;
    // Every form the password could take on the wire, so it can be scrubbed from any error text.
    this.secrets = pass
      ? [
          pass,
          Buffer.from(pass).toString('base64'),
          Buffer.from(`\0${config.user}\0${pass}`).toString('base64'),
        ]
      : [];
  }

  fail(reason, opts) {
    return new SmtpError(cleanReason(reason, this.secrets), opts);
  }

  attach(socket) {
    this.socket = socket;
    this.buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      this.buffer += chunk;
      let idx;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        this.lines.push(this.buffer.slice(0, idx).replace(/\r$/, ''));
        this.buffer = this.buffer.slice(idx + 1);
      }
      this.tryResolve();
    });
    socket.on('error', (err) => this.abort(this.fail(err.code || err.message, { code: 'connect', stage: 'connect' })));
    socket.on('close', () => this.abort(this.fail('Connection closed by server', { code: 'closed', stage: 'connect' })));
  }

  // A reply is complete when a line has a space (not "-") after the 3-digit code.
  tryResolve() {
    if (!this.waiter) return;
    const end = this.lines.findIndex((l) => !/^\d{3}-/.test(l));
    if (end === -1) return;
    const replyLines = this.lines.splice(0, end + 1);
    const code = Number(replyLines[0].slice(0, 3));
    const text = replyLines.map((l) => l.slice(4)).join('\n');
    const { resolve, timer } = this.waiter;
    clearTimeout(timer);
    this.waiter = null;
    resolve({ code, text, lines: replyLines.map((l) => l.slice(4)) });
  }

  abort(err) {
    this.alive = false;
    if (this.waiter) {
      const { reject, timer } = this.waiter;
      clearTimeout(timer);
      this.waiter = null;
      reject(err);
    }
  }

  readReply(label, stage) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        this.alive = false;
        this.socket?.destroy();
        reject(new SmtpError(`Timed out waiting for reply to ${label}`, { code: 'timeout', stage }));
      }, COMMAND_TIMEOUT_MS);
      this.waiter = { resolve, reject, timer };
      this.tryResolve();
    });
  }

  // label is what appears in errors, so AUTH payloads are never echoed.
  async command(line, expected, { label, stage = 'message' } = {}) {
    if (!this.socket || this.socket.destroyed) {
      throw new SmtpError('Connection is not open', { code: 'closed', stage: 'connect' });
    }
    if (line !== null) this.socket.write(`${line}\r\n`);
    const reply = await this.readReply(label || line?.split(' ')[0] || 'greeting', stage);
    const ok = Array.isArray(expected) ? expected.includes(reply.code) : reply.code === expected;
    if (!ok) {
      throw this.fail(`${label || line?.split(' ')[0] || 'greeting'} rejected: ${reply.text}`, {
        code: reply.code,
        permanent: reply.code >= 500 && reply.code < 600,
        stage,
      });
    }
    return reply;
  }

  openSocket() {
    const { host, port, secure } = this.config;
    return new Promise((resolve, reject) => {
      // SNI must be a hostname (RFC 6066); certificate checks still run against `host`.
      const tlsOptions = { host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: true, minVersion: 'TLSv1.2' };
      const socket = secure ? tls.connect(tlsOptions) : net.connect({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new SmtpError(`Connect timed out after ${CONNECT_TIMEOUT_MS / 1000}s`, { code: 'timeout', stage: 'connect' }));
      }, CONNECT_TIMEOUT_MS);
      socket.once(secure ? 'secureConnect' : 'connect', () => {
        clearTimeout(timer);
        socket.removeAllListeners('error');
        resolve(socket);
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(this.fail(`Connect failed: ${err.code || err.message}`, { code: secure ? 'tls' : 'connect', stage: 'connect' }));
      });
    });
  }

  upgradeToTls() {
    const { host } = this.config;
    const plain = this.socket;
    plain.removeAllListeners('data');
    plain.removeAllListeners('error');
    plain.removeAllListeners('close');
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ socket: plain, host, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new SmtpError('TLS upgrade timed out', { code: 'timeout', stage: 'connect' }));
      }, CONNECT_TIMEOUT_MS);
      socket.once('secureConnect', () => {
        clearTimeout(timer);
        socket.removeAllListeners('error');
        resolve(socket);
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        reject(this.fail(`TLS upgrade failed: ${err.code || err.message}`, { code: 'tls', stage: 'connect' }));
      });
    });
  }

  async ehlo() {
    const domain = this.config.from.split('@')[1] || 'localhost';
    const reply = await this.command(`EHLO ${domain}`, 250, { stage: 'connect' });
    this.capabilities = new Map();
    for (const l of reply.lines.slice(1)) {
      const [key, ...rest] = l.trim().split(/\s+/);
      if (key) this.capabilities.set(key.toUpperCase(), rest.map((r) => r.toUpperCase()));
    }
  }

  async connect() {
    this.attach(await this.openSocket());
    this.alive = true;
    try {
      await this.command(null, 220, { label: 'greeting', stage: 'connect' });
      await this.ehlo();
      if (!this.config.secure) {
        if (!this.capabilities.has('STARTTLS')) {
          throw new SmtpError('Server does not offer STARTTLS; refusing to send credentials in plain text', {
            code: 'tls', stage: 'connect',
          });
        }
        await this.command('STARTTLS', 220, { stage: 'connect' });
        this.attach(await this.upgradeToTls());
        await this.ehlo();
      }
      await this.authenticate();
    } catch (err) {
      this.destroy();
      throw err;
    }
  }

  async authenticate() {
    if (!this.socket.encrypted) {
      throw new SmtpError('Refusing to authenticate without TLS', { code: 'tls', stage: 'auth' });
    }
    const { user, password } = this.config;
    const mechs = this.capabilities.get('AUTH') || [];
    const tryPlain = mechs.length === 0 || mechs.includes('PLAIN');
    const canLogin = mechs.includes('LOGIN');
    if (tryPlain) {
      const token = Buffer.from(`\0${user}\0${password}`).toString('base64');
      try {
        await this.command(`AUTH PLAIN ${token}`, 235, { label: 'AUTH PLAIN', stage: 'auth' });
        return;
      } catch (err) {
        if (!canLogin || !(err instanceof SmtpError) || typeof err.code !== 'number') throw err;
      }
    }
    if (!canLogin && !tryPlain) {
      throw new SmtpError(`No supported AUTH mechanism (server offers ${mechs.join(', ') || 'none'})`, {
        code: 'auth', permanent: true, stage: 'auth',
      });
    }
    await this.command('AUTH LOGIN', 334, { label: 'AUTH LOGIN', stage: 'auth' });
    await this.command(Buffer.from(user).toString('base64'), 334, { label: 'AUTH LOGIN user', stage: 'auth' });
    await this.command(Buffer.from(password).toString('base64'), 235, { label: 'AUTH LOGIN password', stage: 'auth' });
  }

  // message: { to, subject, html, text, replyTo, headers }. Resolves { messageId, code, response }.
  async send(message) {
    if (!this.alive) throw new SmtpError('Connection is not open', { code: 'closed', stage: 'connect' });
    const { from, fromName } = this.config;
    const { raw, messageId } = buildMessage({ ...pickMessage(message), from, fromName });
    if (this.sentCount > 0) await this.command('RSET', 250);
    this.sentCount += 1;
    await this.command(`MAIL FROM:<${from}>`, 250, { label: 'MAIL FROM' });
    await this.command(`RCPT TO:<${message.to}>`, [250, 251], { label: 'RCPT TO' });
    await this.command('DATA', 354);
    // dotStuff already uses CRLF; the lone "." line ends the DATA section.
    const reply = await this.command(`${dotStuff(raw)}\r\n.`, 250, { label: 'message body' });
    return { messageId, code: reply.code, response: cleanReason(reply.text, this.secrets) };
  }

  async close() {
    if (!this.socket || this.socket.destroyed) return;
    try {
      if (this.alive) await this.command('QUIT', 221);
    } catch {
      // Server may hang up before replying; nothing to do.
    }
    this.destroy();
  }

  destroy() {
    this.alive = false;
    if (this.socket) {
      this.socket.removeAllListeners('close');
      this.socket.destroy();
    }
  }
}

// Only these fields reach the message builder (from/fromName always come from config).
function pickMessage(m) {
  return {
    to: m?.to,
    subject: m?.subject,
    html: m?.html,
    text: m?.text,
    replyTo: m?.replyTo,
    headers: m?.headers,
  };
}

function assertConfigured() {
  if (!isMailConfigured()) {
    throw new SmtpError('Mail is not configured (SMTP_HOST, SMTP_USER, SMTP_PASSWORD, MAIL_FROM)', {
      code: 'not_configured', permanent: true, stage: 'config',
    });
  }
}

// Opens and authenticates one connection. Use session.send() for each message, then session.close().
export async function createConnection() {
  assertConfigured();
  const session = new SmtpSession(getConfig());
  await session.connect();
  return session;
}

// One-shot send: connect, send, QUIT.
export async function sendMail(message) {
  assertConfigured();
  // Validate before opening a connection so a bad address costs nothing.
  if (!isValidAddress(message?.to)) {
    throw new SmtpError('Invalid recipient address', { code: 'bad_address', permanent: true });
  }
  const session = await createConnection();
  try {
    return await session.send(message);
  } finally {
    await session.close();
  }
}
