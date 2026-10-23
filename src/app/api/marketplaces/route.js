import { getDb } from '@/lib/db';
import { json, readJson, route, conflict } from '@/lib/api';
import { requireUser, requireAdmin } from '@/lib/auth';
import { Validator, slugify } from '@/lib/validate';
import { logActivity } from '@/lib/activity';

const serialize = (m) => ({ key: m.key, name: m.name, isActive: m.isActive !== false });

export const GET = route(async () => {
  await requireUser();
  const db = await getDb();
  const marketplaces = await db.collection('marketplaces').find({}).sort({ createdAt: 1 }).toArray();
  return json({ marketplaces: marketplaces.map(serialize) });
});

// New marketplaces can be added without code changes.
export const POST = route(async (request) => {
  const admin = await requireAdmin();
  const body = await readJson(request);
  const v = new Validator();
  const name = v.string('name', body.name, { required: true, max: 60, label: 'Marketplace name' });
  v.assert();
  const key = slugify(name);
  if (!key) throw conflict('Marketplace name must contain letters or numbers');
  const db = await getDb();
  if (await db.collection('marketplaces').findOne({ key })) throw conflict('This marketplace already exists');
  const doc = { key, name, isActive: true, createdAt: new Date() };
  await db.collection('marketplaces').insertOne(doc);
  await logActivity(admin, 'marketplace.created', { entityType: 'marketplace', summary: `Added marketplace ${name}` });
  return json({ marketplace: serialize(doc) }, { status: 201 });
});
