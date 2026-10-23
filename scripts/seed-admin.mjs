// Creates the initial Admin account from environment variables.
// Usage: npm run seed:admin   (reads .env.local)
// Refuses to run if any admin already exists, so it cannot be used as a backdoor later.
import { MongoClient } from 'mongodb';
import { hashPassword, validateNewPassword } from '../src/lib/password.js';

const { MONGODB_URI, MONGODB_DB_NAME = 'product_hub', ADMIN_NAME = 'Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!MONGODB_URI) fail('MONGODB_URI is not set');
if (!ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) fail('ADMIN_EMAIL must be a valid email');
const problem = validateNewPassword(ADMIN_PASSWORD);
if (problem) fail(`ADMIN_PASSWORD: ${problem}`);
if (ADMIN_PASSWORD.length < 12) fail('ADMIN_PASSWORD must be at least 12 characters for the admin account');

const client = new MongoClient(MONGODB_URI);
try {
  await client.connect();
  const users = client.db(MONGODB_DB_NAME).collection('users');
  await users.createIndex({ email: 1 }, { unique: true });
  const existingAdmin = await users.findOne({ role: 'admin' });
  if (existingAdmin) fail(`An admin already exists (${existingAdmin.email}). Manage users from the app instead.`);

  const now = new Date();
  await users.insertOne({
    name: ADMIN_NAME.trim().slice(0, 100) || 'Admin',
    email: ADMIN_EMAIL.trim().toLowerCase(),
    role: 'admin',
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    isActive: true,
    mustChangePassword: false,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });
  console.log(`✔ Admin account created for ${ADMIN_EMAIL.trim().toLowerCase()}`);
  console.log('  You can now remove ADMIN_PASSWORD from your environment file.');
} finally {
  await client.close();
}
