// Phase 1 migration: turns existing listing users into resellers on a complimentary plan.
//
// Usage (dry run, the default; writes nothing):
//   node --env-file=.env.local scripts/migrate-resellers.mjs --comp-until=2026-12-31
// Apply:
//   node --env-file=.env.local scripts/migrate-resellers.mjs --apply --comp-until=2026-12-31 --backup-dir=/path/to/dir
//
// For every user with role `listing_user` and no `planEndsAt`:
//   - plan fields: planEndsAt = comp date 23:59:59 IST, planStartedAt = now, planCode = null, planSource = 'comp'
//   - allAccessUntil = the comp end (raised with $max, never lowered): all categories until then, like m3.
//     Time-limited on purpose: adminMode 'all' would never expire and survive later paid m1 plans.
//   - categoryAccess = { adminMode: 'selected', adminCategoryIds: [], selfCategoryIds: [], selfChangedAt: null, updatedAt: now }
//   - emailPrefs (defaults) and source = 'migration' when missing
//   - one `subscriptions` record with source 'migration' (skipped if one already exists for the user)
//   - creates resellerListings (portal meesho) only for shared Meesho listings the user worked on:
//     (a) listing.updatedBy is the user and status is not 'not_started' -> copy the status;
//     (b) the user wrote notes on it -> copy those notes (status 'not_started' unless (a) holds).
//     Every other listing is skipped and counted in the summary.
//   - removes planExempt and canEditListings
// Idempotent: the user document is updated last, so a re-run after a partial failure finishes the job,
// and a re-run after success finds nothing to do. Shared listings and history collections are only read.
//
// --backup-dir is required for --apply (except on product_hub_selftest): the affected collections are
// exported there as Extended JSON before any write.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { BSON, MongoClient } from 'mongodb';

const { EJSON } = BSON;
const RESELLER_STATUSES = ['not_started', 'in_progress', 'listed', 'needs_changes', 'paused'];
const MAX_NOTES = 50;
const DEFAULT_EMAIL_PREFS = { productUpdates: true, stockAlerts: true, reminders: true };
const SELFTEST_DB = 'product_hub_selftest';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { apply: false, compUntil: null, backupDir: null };
  for (const arg of argv) {
    if (arg === '--apply') out.apply = true;
    else if (arg.startsWith('--comp-until=')) out.compUntil = arg.slice('--comp-until='.length);
    else if (arg.startsWith('--backup-dir=')) out.backupDir = arg.slice('--backup-dir='.length);
    else if (arg === '--dry-run') out.apply = false;
    else fail(`Unknown argument: ${arg}`);
  }
  return out;
}

// YYYY-MM-DD -> that day at 23:59:59.999 IST (UTC+05:30).
function parseCompDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T23:59:59.999+05:30`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject impossible dates such as 2026-02-31 (Date would roll them over).
  const istDay = new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
  return istDay === value ? date : null;
}

const args = parseArgs(process.argv.slice(2));
const { MONGODB_URI, MONGODB_DB_NAME } = process.env;
if (!MONGODB_URI) fail('MONGODB_URI is not set');
if (!MONGODB_DB_NAME) fail('MONGODB_DB_NAME is not set (set it explicitly; there is no default for this script)');
if (MONGODB_DB_NAME.trim().toLowerCase() === 'meesho-admin') fail('Refusing to touch the meesho-admin database');

const now = new Date();
let compEndsAt = null;
if (args.compUntil !== null) {
  compEndsAt = parseCompDate(args.compUntil);
  if (!compEndsAt) fail('--comp-until must be a valid date in the form YYYY-MM-DD');
  if (compEndsAt <= now) fail('--comp-until must be in the future');
}
if (args.apply && !compEndsAt) fail('--apply needs --comp-until=YYYY-MM-DD');
if (args.apply && !args.backupDir && MONGODB_DB_NAME !== SELFTEST_DB) fail('--apply needs --backup-dir=<dir> for this database');
const compDays = compEndsAt ? Math.ceil((compEndsAt.getTime() - now.getTime()) / 86400000) : null;

const idStr = (id) => (id ? id.toString() : '');
const pendingFilter = { role: 'listing_user', $or: [{ planEndsAt: { $exists: false } }, { planEndsAt: null }] };

async function counts(db) {
  const users = db.collection('users');
  const [listingUsers, withoutPlan, compPlans, withPlanExempt, withCanEditListings, migrationSubs, resellerMeesho] = await Promise.all([
    users.countDocuments({ role: 'listing_user' }),
    users.countDocuments(pendingFilter),
    users.countDocuments({ role: 'listing_user', planSource: 'comp' }),
    users.countDocuments({ role: 'listing_user', planExempt: { $exists: true } }),
    users.countDocuments({ role: 'listing_user', canEditListings: { $exists: true } }),
    db.collection('subscriptions').countDocuments({ source: 'migration' }),
    db.collection('resellerListings').countDocuments({ portal: 'meesho' }),
  ]);
  return { listingUsers, withoutPlan, compPlans, withPlanExempt, withCanEditListings, migrationSubs, resellerMeesho };
}

function printCounts(label, c) {
  console.log(`\n${label}`);
  console.log(`  listing users ................. ${c.listingUsers}`);
  console.log(`  ... without planEndsAt ........ ${c.withoutPlan}`);
  console.log(`  ... with planSource 'comp' .... ${c.compPlans}`);
  console.log(`  ... with planExempt ........... ${c.withPlanExempt}`);
  console.log(`  ... with canEditListings ...... ${c.withCanEditListings}`);
  console.log(`  migration subscriptions ....... ${c.migrationSubs}`);
  console.log(`  resellerListings (meesho) ..... ${c.resellerMeesho}`);
}

async function backup(db, dir) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const target = path.resolve(dir, `migrate-resellers-${MONGODB_DB_NAME}-${stamp}`);
  await mkdir(target, { recursive: true });
  const sets = {
    'users.listing_user.json': db.collection('users').find({ role: 'listing_user' }),
    'subscriptions.json': db.collection('subscriptions').find({}),
    'resellerListings.json': db.collection('resellerListings').find({}),
    'marketplaceListings.meesho.json': db.collection('marketplaceListings').find({ marketplace: 'meesho' }),
  };
  for (const [file, cursor] of Object.entries(sets)) {
    const docs = await cursor.toArray();
    await writeFile(path.join(target, file), EJSON.stringify(docs, null, 2, { relaxed: false }));
    console.log(`  backup: ${file} (${docs.length} docs)`);
  }
  return target;
}

function planForUser(user, sharedListings, existingKeys, hasMigrationSub) {
  const set = {
    planEndsAt: compEndsAt,
    planStartedAt: now,
    planCode: null,
    planSource: 'comp',
    categoryAccess: { adminMode: 'selected', adminCategoryIds: [], selfCategoryIds: [], selfChangedAt: null, updatedAt: now },
    updatedAt: now,
  };
  if (!user.emailPrefs) set.emailPrefs = { ...DEFAULT_EMAIL_PREFS };
  if (!user.source) set.source = 'migration';
  const unset = {};
  if ('planExempt' in user) unset.planExempt = '';
  if ('canEditListings' in user) unset.canEditListings = '';

  // Only listings this user actually worked on:
  //   (a) last updated by this user with a status other than not_started -> copy the status;
  //   (b) has notes written by this user -> copy those notes (status only if (a) also holds).
  const listingOps = [];
  let notesCopied = 0;
  let skippedNotWorked = 0;
  let alreadyPresent = 0;
  const userId = idStr(user._id);
  for (const listing of sharedListings) {
    const notes = (listing.notes || [])
      .filter((n) => n && idStr(n.userId) === userId)
      .map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt }))
      .slice(-MAX_NOTES);
    const updatedByUser = idStr(listing.updatedBy) === userId && listing.status && listing.status !== 'not_started';
    if (!updatedByUser && notes.length === 0) {
      skippedNotWorked += 1;
      continue;
    }
    if (existingKeys.has(idStr(listing.productId))) {
      alreadyPresent += 1;
      continue;
    }
    notesCopied += notes.length;
    const status = updatedByUser && RESELLER_STATUSES.includes(listing.status) ? listing.status : 'not_started';
    listingOps.push({
      updateOne: {
        filter: { userId: user._id, productId: listing.productId, portal: 'meesho' },
        update: {
          $setOnInsert: {
            userId: user._id,
            productId: listing.productId,
            portal: 'meesho',
            portalLabel: null,
            status,
            notes,
            savedVersions: [],
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    });
  }

  const subscription = hasMigrationSub
    ? null
    : {
        userId: user._id,
        planCode: null,
        tier: 'all',
        days: compDays,
        amountPaise: 0,
        startsAt: now,
        endsAt: compEndsAt,
        paymentId: null,
        couponId: null,
        source: 'migration',
        createdBy: null,
        note: 'Phase 1 migration: complimentary access for existing listing user',
        createdAt: now,
      };

  // $max keeps a later all-access end if one was somehow set already.
  const max = { allAccessUntil: compEndsAt };
  return { set, unset, max, listingOps, notesCopied, skippedNotWorked, alreadyPresent, subscription };
}

const client = new MongoClient(MONGODB_URI);
try {
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);
  console.log(`Database: ${MONGODB_DB_NAME}`);
  console.log(`Mode: ${args.apply ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);
  console.log(`Comp until: ${compEndsAt ? `${args.compUntil} 23:59 IST (${compEndsAt.toISOString()}), ${compDays} days` : '(not set)'}`);

  const before = await counts(db);
  printCounts('Before:', before);

  const users = await db.collection('users').find(pendingFilter).sort({ createdAt: 1 }).toArray();
  const sharedListings = await db
    .collection('marketplaceListings')
    .find({ marketplace: 'meesho' }, { projection: { productId: 1, status: 1, notes: 1, updatedBy: 1 } })
    .toArray();
  console.log(`\nShared Meesho listings: ${sharedListings.length}`);
  console.log(`Users to migrate: ${users.length}`);

  if (args.apply && users.length && args.backupDir) {
    console.log('\nWriting backup before changes...');
    const target = await backup(db, args.backupDir);
    console.log(`  backup folder: ${target}`);
  }

  const totals = { users: 0, subsInserted: 0, subsSkipped: 0, listingsInserted: 0, listingsExisting: 0, listingsSkipped: 0, notesCopied: 0, fieldsRemoved: 0 };
  for (const user of users) {
    const [existing, migrationSub] = await Promise.all([
      db.collection('resellerListings').find({ userId: user._id, portal: 'meesho' }, { projection: { productId: 1 } }).toArray(),
      db.collection('subscriptions').findOne({ userId: user._id, source: 'migration' }, { projection: { _id: 1 } }),
    ]);
    const existingKeys = new Set(existing.map((r) => idStr(r.productId)));
    const plan = planForUser(user, sharedListings, existingKeys, Boolean(migrationSub));
    const removed = Object.keys(plan.unset);

    console.log(`\n- ${user.email} (${idStr(user._id)})`);
    console.log(`    set: ${Object.keys(plan.set).join(', ')}, allAccessUntil (max)`);
    console.log(`    remove: ${removed.length ? removed.join(', ') : '(nothing)'}`);
    console.log(`    subscription: ${plan.subscription ? `insert (${compDays ?? '?'} days)` : 'skip (migration subscription exists)'}`);
    console.log(
      `    resellerListings: ${plan.listingOps.length} to create, ${plan.alreadyPresent} already exist, ` +
        `${plan.skippedNotWorked} skipped (user did not work on them); notes to copy: ${plan.notesCopied}`
    );

    totals.users += 1;
    totals.listingsSkipped += plan.skippedNotWorked;
    totals.fieldsRemoved += removed.length;
    totals.notesCopied += plan.notesCopied;
    if (plan.subscription) totals.subsInserted += 1;
    else totals.subsSkipped += 1;

    if (!args.apply) {
      totals.listingsInserted += plan.listingOps.length;
      continue;
    }

    if (plan.listingOps.length) {
      const result = await db.collection('resellerListings').bulkWrite(plan.listingOps, { ordered: false });
      totals.listingsInserted += result.upsertedCount;
      totals.listingsExisting += plan.listingOps.length - result.upsertedCount;
    }
    if (plan.subscription) await db.collection('subscriptions').insertOne(plan.subscription);
    // User document last: it removes the user from the pending filter, so a crash above is retried on re-run.
    const update = { $set: plan.set, $max: plan.max };
    if (removed.length) update.$unset = plan.unset;
    await db.collection('users').updateOne({ _id: user._id, ...pendingFilter }, update);
  }

  console.log(`\n${args.apply ? 'Applied' : 'Would apply'}:`);
  console.log(`  users migrated ................ ${totals.users}`);
  console.log(`  subscriptions inserted ........ ${totals.subsInserted} (skipped: ${totals.subsSkipped})`);
  console.log(`  resellerListings created ...... ${totals.listingsInserted}${args.apply ? ` (already present: ${totals.listingsExisting})` : ''}`);
  console.log(`  listings skipped (not worked) . ${totals.listingsSkipped}`);
  console.log(`  notes copied .................. ${totals.notesCopied}`);
  console.log(`  legacy fields removed ......... ${totals.fieldsRemoved}`);

  if (args.apply) printCounts('After:', await counts(db));
  else console.log('\nDry run only. Nothing was written. Re-run with --apply --comp-until=YYYY-MM-DD to write.');
} finally {
  await client.close();
}
