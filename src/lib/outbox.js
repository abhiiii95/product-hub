import { getDb, toObjectId } from './db.js';
import { createConnection, isMailConfigured, isValidAddress, SmtpError } from './mailer.js';
import { render, hasTemplate, SECRET_TEMPLATES } from './emailTemplates.js';
import { encryptSecret, decryptSecret } from './tokens.js';

// Email queue in the `emailOutbox` collection. Requests only enqueue; the cron route drains
// in small batches so no request waits on SMTP and Vercel's time limit is respected.

const SECRET_INFO = 'pending-credential';
const LOCK_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;
// Backoff after attempt 1, 2, 3, 4 (attempt 5 is final).
const BACKOFF_MS = [5 * 60 * 1000, 30 * 60 * 1000, 2 * 60 * 60 * 1000, 12 * 60 * 60 * 1000];
// Do not start a new send when less than this is left of the budget (one send can take several commands).
const SEND_RESERVE_MS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

function dailyLimit() {
  const n = Number(process.env.MAIL_DAILY_LIMIT);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200;
}

function collection(db) {
  return db.collection('emailOutbox');
}

function errorText(err) {
  if (err instanceof SmtpError) return err.message.slice(0, 300);
  return String(err?.message || err || 'Unknown error').replace(/\s+/g, ' ').slice(0, 300);
}

// Only template, status and a cleaned error are logged: never the address, body or secret.
function log(template, status, err) {
  const line = `[outbox] ${template} ${status}${err ? `: ${errorText(err)}` : ''}`;
  if (status === 'sent') console.info(line);
  else console.warn(line);
}

/**
 * Queues one email. Returns { id, duplicate }.
 * `secret` (a temporary password) is stored encrypted and removed once the mail is sent.
 * A repeated `dedupeKey` does not queue a second copy; the existing id is returned with duplicate: true.
 */
export async function enqueue({ to, userId, template, data, secret, priority = 2, dedupeKey, sendAfter } = {}) {
  const address = typeof to === 'string' ? to.trim().toLowerCase() : '';
  if (!isValidAddress(address)) throw new Error('enqueue: invalid recipient address');
  if (!hasTemplate(template)) throw new Error(`enqueue: unknown template ${String(template).slice(0, 40)}`);
  if (SECRET_TEMPLATES.has(template) && !secret) throw new Error(`enqueue: template ${template} needs a secret`);

  // The password only ever travels encrypted in `secret`, never in plain `data`.
  const safeData = data && typeof data === 'object' ? { ...data } : {};
  delete safeData.tempPassword;

  const now = new Date();
  const doc = {
    to: address,
    userId: userId ? toObjectId(userId) || null : null,
    template,
    data: safeData,
    priority: [0, 1, 2].includes(priority) ? priority : 2,
    status: 'queued',
    attempts: 0,
    sendAfter: sendAfter instanceof Date && !Number.isNaN(sendAfter.getTime()) ? sendAfter : now,
    createdAt: now,
    updatedAt: now,
  };
  if (secret) doc.secret = encryptSecret(String(secret), SECRET_INFO);
  if (typeof dedupeKey === 'string' && dedupeKey) doc.dedupeKey = dedupeKey;

  const col = collection(await getDb());
  if (!doc.dedupeKey) {
    const res = await col.insertOne(doc);
    return { id: res.insertedId, duplicate: false };
  }
  // Upsert so a repeat is caught even before the unique index exists (fresh DB);
  // the unique index still settles two concurrent enqueues (E11000).
  try {
    const res = await col.updateOne({ dedupeKey: doc.dedupeKey }, { $setOnInsert: doc }, { upsert: true });
    if (res.upsertedId) return { id: res.upsertedId, duplicate: false };
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }
  const existing = await col.findOne({ dedupeKey: doc.dedupeKey }, { projection: { _id: 1 } });
  return { id: existing?._id || null, duplicate: true };
}

async function sentInLastDay(col, now) {
  return col.countDocuments({ status: 'sent', sentAt: { $gte: new Date(now.getTime() - DAY_MS) } });
}

// Atomically moves one due message to `sending` (also reclaims ones whose lock expired after a crash).
async function claimNext(col) {
  const now = new Date();
  return col.findOneAndUpdate(
    {
      $or: [
        { status: 'queued', sendAfter: { $lte: now } },
        { status: 'sending', lockedUntil: { $lt: now } },
      ],
    },
    { $set: { status: 'sending', lockedUntil: new Date(now.getTime() + LOCK_MS), updatedAt: now } },
    { sort: { priority: 1, sendAfter: 1 }, returnDocument: 'after' }
  );
}

async function markSent(col, doc) {
  const now = new Date();
  await col.updateOne(
    { _id: doc._id },
    {
      $set: { status: 'sent', sentAt: now, updatedAt: now, attempts: (doc.attempts || 0) + 1 },
      $unset: { secret: '', lockedUntil: '', lastError: '' },
    }
  );
}

async function markFailed(col, doc, err) {
  const now = new Date();
  // A failed welcome is re-sent with a fresh password via resend-welcome, so the old secret is dropped.
  await col.updateOne(
    { _id: doc._id },
    {
      $set: { status: 'failed', lastError: errorText(err), updatedAt: now, attempts: (doc.attempts || 0) + 1 },
      $unset: { secret: '', lockedUntil: '' },
    }
  );
}

// Returns 'deferred' or 'failed' (after the last attempt).
async function markRetry(col, doc, err) {
  const attempts = (doc.attempts || 0) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await markFailed(col, { ...doc, attempts: attempts - 1 }, err);
    return 'failed';
  }
  const now = new Date();
  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        status: 'queued',
        attempts,
        lastError: errorText(err),
        sendAfter: new Date(now.getTime() + BACKOFF_MS[attempts - 1]),
        updatedAt: now,
      },
      $unset: { lockedUntil: '' },
    }
  );
  return 'deferred';
}

function isPermanent(err) {
  if (err instanceof SmtpError) {
    // A 5xx during login is a server/account problem, not this message's fault: retry with backoff.
    if (err.stage === 'auth' || err.stage === 'connect') return false;
    return err.permanent || err.code === 'not_configured';
  }
  // Render or decrypt errors will not fix themselves.
  return true;
}

function buildMessage(doc) {
  const data = { ...(doc.data || {}) };
  if (SECRET_TEMPLATES.has(doc.template)) {
    if (!doc.secret) throw new Error('Temporary password is missing');
    // decryptSecret returns null for tampered values or a changed AUTH_SECRET.
    data.tempPassword = decryptSecret(doc.secret, SECRET_INFO);
    if (!data.tempPassword) throw new Error('Temporary password could not be decrypted');
  }
  const { subject, html, text } = render(doc.template, data);
  const headers = {};
  if (doc.data?.listUnsubscribe) headers['List-Unsubscribe'] = String(doc.data.listUnsubscribe);
  return { to: doc.to, subject, html, text, headers };
}

/**
 * Sends due messages over one SMTP connection until `max` are processed, the daily cap is hit
 * or `budgetMs` is used up. Returns { sent, failed, deferred, remainingQueued, capReached }.
 */
export async function drain({ budgetMs = 40000, max = 50 } = {}) {
  const started = Date.now();
  const db = await getDb();
  const col = collection(db);
  const result = { sent: 0, failed: 0, deferred: 0, remainingQueued: 0, capReached: false };

  // Leave the queue untouched while SMTP is not configured, so welcome mails are not lost to a missing env var.
  if (!isMailConfigured()) {
    result.notConfigured = true;
    result.remainingQueued = await col.countDocuments({ status: 'queued' });
    return result;
  }

  const limit = dailyLimit();
  const capLeft = limit - (await sentInLastDay(col, new Date()));
  if (capLeft <= 0) {
    result.capReached = true;
    result.remainingQueued = await col.countDocuments({ status: 'queued' });
    return result;
  }
  const allowed = Math.min(max, capLeft);

  let conn = null;
  let processed = 0;
  try {
    while (processed < allowed && Date.now() - started < budgetMs - SEND_RESERVE_MS) {
      const doc = await claimNext(col);
      if (!doc) break;
      processed += 1;

      let message;
      try {
        message = buildMessage(doc);
      } catch (err) {
        await markFailed(col, doc, err);
        result.failed += 1;
        log(doc.template, 'failed', err);
        continue;
      }

      try {
        // Reopen lazily: the first message opens it, and a dropped connection is replaced.
        if (!conn || !conn.alive) conn = await createConnection();
        await conn.send(message);
        await markSent(col, doc);
        result.sent += 1;
        log(doc.template, 'sent');
      } catch (err) {
        if (isPermanent(err)) {
          await markFailed(col, doc, err);
          result.failed += 1;
          log(doc.template, 'failed', err);
        } else {
          const outcome = await markRetry(col, doc, err);
          result[outcome] += 1;
          log(doc.template, outcome, err);
          // Cannot connect or log in: the rest of the batch would fail the same way.
          if (err instanceof SmtpError && (err.stage === 'connect' || err.stage === 'auth')) break;
        }
      }
    }
  } finally {
    if (conn) await conn.close();
  }

  result.capReached = result.sent >= capLeft;
  result.remainingQueued = await col.countDocuments({ status: 'queued' });
  return result;
}

// Summary for the admin page. Never includes `secret` or message bodies.
// Cancels a user's still-queued mails of one template, e.g. a welcome whose temporary
// password was replaced. The encrypted secret is removed with it.
export async function cancelQueued(userId, template) {
  const id = toObjectId(userId);
  if (!id) return 0;
  const col = collection(await getDb());
  const res = await col.updateMany(
    { userId: id, template, status: 'queued' },
    { $set: { status: 'cancelled', updatedAt: new Date() }, $unset: { secret: '' } }
  );
  return res.modifiedCount;
}

export async function outboxStats() {
  const db = await getDb();
  const col = collection(db);
  const now = new Date();
  const since = new Date(now.getTime() - DAY_MS);
  const [byStatus, sent24h, failed24h, oldestQueued, lastSent, recentFailures] = await Promise.all([
    col.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
    col.countDocuments({ status: 'sent', sentAt: { $gte: since } }),
    col.countDocuments({ status: 'failed', updatedAt: { $gte: since } }),
    col.findOne({ status: 'queued' }, { sort: { sendAfter: 1 }, projection: { sendAfter: 1 } }),
    col.findOne({ status: 'sent' }, { sort: { sentAt: -1 }, projection: { sentAt: 1 } }),
    col
      .find({ status: 'failed' }, { sort: { updatedAt: -1 }, limit: 10, projection: { to: 1, template: 1, lastError: 1, attempts: 1, updatedAt: 1 } })
      .toArray(),
  ]);
  const counts = { queued: 0, sending: 0, sent: 0, failed: 0, cancelled: 0 };
  for (const row of byStatus) if (row._id in counts) counts[row._id] = row.count;
  const limit = dailyLimit();
  return {
    configured: isMailConfigured(),
    counts,
    dailyLimit: limit,
    sentLast24h: sent24h,
    remainingToday: Math.max(0, limit - sent24h),
    failedLast24h: failed24h,
    nextDueAt: oldestQueued?.sendAfter || null,
    lastSentAt: lastSent?.sentAt || null,
    recentFailures: recentFailures.map((f) => ({
      id: String(f._id),
      to: f.to,
      template: f.template,
      lastError: f.lastError || null,
      attempts: f.attempts || 0,
      at: f.updatedAt || null,
    })),
  };
}
