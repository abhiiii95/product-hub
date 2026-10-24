// End-to-end authorization tests against a running server.
// Usage: start the app (npm run dev / npm start), then:
//   TEST_BASE_URL=http://localhost:3000 npm run test:authz
// Uses ADMIN_EMAIL / ADMIN_PASSWORD (or TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD) to sign in.
// Everything it creates is removed at the end.

const BASE = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
const RUN = Date.now().toString(36);

let passed = 0;
let failed = 0;
const cleanup = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✔ ${name}`);
  } else {
    failed += 1;
    console.log(`  ✖ ${name} ${extra}`);
  }
}

class Client {
  constructor() {
    this.cookie = '';
  }
  async request(method, path, body, headers = {}) {
    const init = { method, headers: { ...headers }, redirect: 'manual' };
    if (this.cookie) init.headers.cookie = this.cookie;
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, init);
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/ph_session=([^;]*)/);
      if (match) this.cookie = match[1] ? `ph_session=${match[1]}` : '';
    }
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data, text };
  }
  get(p) { return this.request('GET', p); }
  post(p, b) { return this.request('POST', p, b ?? {}); }
  patch(p, b) { return this.request('PATCH', p, b ?? {}); }
  put(p, b) { return this.request('PUT', p, b ?? {}); }
  del(p) { return this.request('DELETE', p); }
  async login(email, password) {
    return this.post('/api/auth/login', { email, password });
  }
}

const SENSITIVE_KEYS = ['purchaseCost', 'packagingCost', 'additionalCost', 'pricing', 'profit', 'margin', 'stock', 'lowStockThreshold', 'isLowStock', 'supplier', 'internalNotes', 'passwordHash'];
const leaksSensitive = (obj) => SENSITIVE_KEYS.filter((k) => JSON.stringify(obj).includes(`"${k}"`));

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error('Set ADMIN_EMAIL/ADMIN_PASSWORD (or TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD).');
    process.exit(1);
  }
  const anon = new Client();
  const admin = new Client();
  const lister = new Client();

  console.log('\nUnauthenticated access');
  for (const [m, p] of [['GET', '/api/products'], ['GET', '/api/users'], ['POST', '/api/users'], ['GET', '/api/dashboard'], ['GET', '/api/categories'], ['GET', '/api/listings']]) {
    const r = await anon.request(m, p, m === 'GET' ? undefined : {});
    check(`${m} ${p} → 401`, r.status === 401, `(got ${r.status})`);
  }
  for (const p of ['/api/auth/register', '/api/auth/signup', '/api/register', '/signup', '/register']) {
    const r = await anon.post(p, { name: 'x', email: `x${RUN}@example.test`, password: 'password123' });
    check(`No self-registration at ${p}`, r.status === 404 || r.status === 405, `(got ${r.status})`);
  }
  const protectedPage = await anon.get('/dashboard');
  check('Protected page redirects to /login', [302, 303, 307, 308].includes(protectedPage.status) || String(protectedPage.text).includes('/login'), `(got ${protectedPage.status})`);

  console.log('\nLogin');
  check('Wrong password rejected', (await anon.login(ADMIN_EMAIL, 'definitely-wrong')).status === 401);
  const adminLogin = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  check('Admin can sign in', adminLogin.status === 200 && adminLogin.data.user.role === 'admin', `(got ${adminLogin.status})`);
  if (adminLogin.status !== 200) throw new Error('Cannot continue without admin login');

  console.log('\nAdmin setup');
  const cat = await admin.post('/api/categories', {
    name: `Test Covers ${RUN}`,
    fields: [
      { label: 'Compatible model', type: 'text', required: true },
      { label: 'Finish', type: 'dropdown', options: ['Matte', 'Glossy'] },
      { label: 'Battery required', type: 'checkbox' },
    ],
  });
  check('Admin creates category with custom fields', cat.status === 201 && cat.data.category.fields.length === 3, JSON.stringify(cat.data));
  const categoryId = cat.data.category?.id;
  cleanup.push(() => admin.del(`/api/categories/${categoryId}`));

  const missingRequired = await admin.post('/api/products', { name: 'Bad', categoryId, customFields: {} });
  check('Required custom field enforced', missingRequired.status === 400);
  const badOption = await admin.post('/api/products', { name: 'Bad', categoryId, customFields: { compatible_model: 'X', finish: 'Shiny' } });
  check('Dropdown option validated', badOption.status === 400);

  const prod = await admin.post('/api/products', {
    name: `Test Product ${RUN}`,
    sku: `T-${RUN}`,
    categoryId,
    purchaseCost: 100,
    packagingCost: 10,
    additionalCost: 5,
    sellingPrice: 230,
    stock: 20,
    lowStockThreshold: 3,
    supplier: 'Secret Supplier',
    internalNotes: 'secret note',
    customFields: { compatible_model: 'iPhone 15', finish: 'Matte', battery_required: true, injected: 'nope' },
    createdBy: 'attacker',
    _id: '000000000000000000000000',
    images: [{ url: 'https://evil.example/x.png' }],
  });
  check('Admin creates product', prod.status === 201, JSON.stringify(prod.data));
  const product = prod.data.product;
  const productId = product.id;
  cleanup.push(() => admin.del(`/api/products/${productId}`));
  check('Unknown custom field dropped', product.customFields.injected === undefined && product.customFields.compatible_model === 'iPhone 15');
  check('Mass-assigned fields ignored (_id, images)', productId !== '000000000000000000000000' && product.images.length === 0);
  check('Pricing: total cost = 115', product.pricing.totalCost === 115);
  check('Pricing: profit = 115', product.pricing.profit === 115);
  check('Pricing: margin = 50%', product.pricing.margin === 50);

  const zeroPrice = await admin.post('/api/products', { name: `Zero ${RUN}`, purchaseCost: 50, sellingPrice: 0 });
  check('Zero selling price → margin null (no division error)', zeroPrice.status === 201 && zeroPrice.data.product.pricing.margin === null && zeroPrice.data.product.pricing.profit === -50);
  cleanup.push(() => admin.del(`/api/products/${zeroPrice.data.product.id}`));

  const inactive = await admin.post('/api/products', { name: `Hidden ${RUN}`, status: 'inactive' });
  const inactiveId = inactive.data.product.id;
  cleanup.push(() => admin.del(`/api/products/${inactiveId}`));

  const listing = await admin.post('/api/listings', {
    productId,
    marketplace: 'meesho',
    title: 'Matte iPhone 15 cover',
    styleId: `STYLE-${RUN}`,
    attributes: [{ name: 'Material', value: 'TPU' }],
    highlights: ['Shockproof', 'Slim'],
  });
  check('Admin creates Meesho listing', listing.status === 201, JSON.stringify(listing.data));
  const listingId = listing.data.listing.id;
  const dup = await admin.post('/api/listings', { productId, marketplace: 'meesho' });
  check('Duplicate listing per marketplace rejected', dup.status === 409);
  const badMp = await admin.post('/api/listings', { productId, marketplace: 'not-a-marketplace' });
  check('Unknown marketplace rejected', badMp.status === 400);

  console.log('\nUser management');
  const badRole = await admin.post('/api/users', { name: 'X', email: `role${RUN}@example.test`, password: 'password123', role: 'superadmin' });
  check('Invalid role rejected', badRole.status === 400);
  const shortPw = await admin.post('/api/users', { name: 'X', email: `pw${RUN}@example.test`, password: 'short' });
  check('Short password rejected', shortPw.status === 400);
  const listerEmail = `lister-${RUN}@example.test`;
  const created = await admin.post('/api/users', { name: 'Test Lister', email: listerEmail, password: 'TempPass-123' });
  check('Admin creates listing user', created.status === 201 && created.data.user.role === 'listing_user');
  check('User response has no password hash', !JSON.stringify(created.data).includes('passwordHash') && !JSON.stringify(created.data).includes('scrypt$'));
  const listerId = created.data.user.id;
  cleanup.push(() => admin.del(`/api/users/${listerId}`));
  const dupUser = await admin.post('/api/users', { name: 'Dup', email: listerEmail.toUpperCase(), password: 'TempPass-123' });
  check('Duplicate email rejected (case-insensitive)', dupUser.status === 409);

  console.log('\nListing user permissions');
  const listerLogin = await lister.login(listerEmail, 'TempPass-123');
  check('Listing user signs in with admin-created account', listerLogin.status === 200 && listerLogin.data.user.role === 'listing_user');

  const list = await lister.get('/api/products');
  check('Listing user can browse products', list.status === 200 && list.data.items.some((p) => p.id === productId));
  check('Product list hides costs/profit/stock/supplier', leaksSensitive(list.data.items).length === 0, leaksSensitive(list.data.items).join(','));
  check('Inactive products hidden from list', !list.data.items.some((p) => p.id === inactiveId));
  const detail = await lister.get(`/api/products/${productId}`);
  check('Listing user can open product details', detail.status === 200 && detail.data.product.name);
  check('Product detail hides sensitive fields', leaksSensitive(detail.data.product).length === 0, leaksSensitive(detail.data.product).join(','));
  check('Inactive product → 404 for listing user', (await lister.get(`/api/products/${inactiveId}`)).status === 404);
  const lowStockProbe = await lister.get('/api/products?lowStock=1&sort=stock_asc');
  check('lowStock filter ignored for listing user', lowStockProbe.status === 200 && leaksSensitive(lowStockProbe.data.items).length === 0);
  const dash = await lister.get('/api/dashboard');
  check('Listing user dashboard has no cost/profit data', dash.status === 200 && !/stockCostValue|averageMargin|pricing|inventory/.test(JSON.stringify(dash.data)));

  const forbiddenCalls = [
    ['GET', '/api/users'],
    ['POST', '/api/users', { name: 'Evil', email: `evil${RUN}@example.test`, password: 'password123', role: 'admin' }],
    ['PATCH', `/api/users/${listerId}`, { role: 'admin' }],
    ['DELETE', `/api/users/${listerId}`],
    ['POST', '/api/categories', { name: 'Evil' }],
    ['PATCH', `/api/categories/${categoryId}`, { name: 'Evil' }],
    ['DELETE', `/api/categories/${categoryId}`],
    ['POST', '/api/products', { name: 'Evil' }],
    ['PATCH', `/api/products/${productId}`, { name: 'Evil', purchaseCost: 1 }],
    ['PATCH', `/api/products/${productId}`, { status: 'inactive' }],
    ['DELETE', `/api/products/${productId}`],
    ['GET', `/api/products/${productId}/stock`],
    ['POST', `/api/products/${productId}/stock`, { type: 'add', quantity: 5 }],
    ['PATCH', `/api/products/${productId}/stock`, { lowStockThreshold: 1 }],
    ['GET', '/api/inventory/movements'],
    ['POST', `/api/products/${productId}/images/sign`, {}],
    ['POST', `/api/products/${productId}/images`, { publicId: 'x' }],
    ['PUT', `/api/products/${productId}/images/abc`, { publicId: 'x' }],
    ['PATCH', `/api/products/${productId}/images`, { order: [] }],
    ['DELETE', `/api/products/${productId}/images/abc`],
    ['POST', '/api/listings', { productId, marketplace: 'meesho' }],
    ['DELETE', `/api/listings/${listingId}`],
    ['POST', '/api/marketplaces', { name: 'Evil' }],
  ];
  for (const [m, p, b] of forbiddenCalls) {
    const r = await lister.request(m, p, b);
    check(`${m} ${p} → 403`, r.status === 403, `(got ${r.status})`);
  }

  const statusUpdate = await lister.patch(`/api/listings/${listingId}`, { status: 'in_progress' });
  check('Listing user can update listing status', statusUpdate.status === 200 && statusUpdate.data.listing.status === 'in_progress');
  const titleHack = await lister.patch(`/api/listings/${listingId}`, { title: 'Hacked' });
  check('Listing user cannot edit listing title', titleHack.status === 403);
  const mixed = await lister.patch(`/api/listings/${listingId}`, { status: 'listed', styleId: 'HACK', suggestedPrice: 1 });
  check('Listing user cannot sneak content fields alongside status', mixed.status === 403);
  const badStatus = await lister.patch(`/api/listings/${listingId}`, { status: 'published' });
  check('Invalid status rejected', badStatus.status === 400);
  const note = await lister.post(`/api/listings/${listingId}/notes`, { text: 'Listed draft on Meesho' });
  check('Listing user can add a note', note.status === 201);
  const version = { marketplace: 'meesho', title: 'Matte iPhone 15 Back Cover', description: 'New text', styleId: 'mat ip15-cvr', sku: 'sku 001' };
  const applied = await lister.put(`/api/products/${productId}/listing-version`, version);
  check('Listing user can save a generated title/description/style ID/SKU', applied.status === 200 && applied.data.listing.title === version.title);
  check('Codes normalised (uppercase, hyphens)', applied.data?.listing?.styleId === 'MAT-IP15-CVR' && applied.data?.listing?.marketplaceSku === 'SKU-001');
  check('Replaced values kept as a previous version', applied.data?.listing?.previousVersions?.[0]?.title === 'Matte iPhone 15 cover');
  check('Saving a version cannot touch other fields', applied.data?.listing?.status === 'in_progress' && applied.data?.listing?.attributes?.length === 1);
  check('Version save on hidden product → 404', (await lister.put(`/api/products/${inactiveId}/listing-version`, version)).status === 404);
  check('Version save without login → 401', (await anon.put(`/api/products/${productId}/listing-version`, version)).status === 401);
  check('Version save needs a title', (await lister.put(`/api/products/${productId}/listing-version`, { ...version, title: '' })).status === 400);
  const restored = await admin.patch(`/api/listings/${listingId}`, { ...listing.data.listing, status: 'in_progress', title: 'Matte iPhone 15 cover', styleId: `STYLE-${RUN}` });
  check('Admin can restore listing content', restored.status === 200);
  const after = await lister.get(`/api/listings/${listingId}`);
  check('Listing content unchanged by listing user', after.data.listing.title === 'Matte iPhone 15 cover' && after.data.listing.styleId === `STYLE-${RUN}`);
  const foreignImage = await admin.post(`/api/products/${productId}/images`, { publicId: 'product-hub/000000000000000000000000/not-mine' });
  check('Admin cannot attach an image that is not in this product\'s storage folder', foreignImage.status === 400 || foreignImage.status === 503, `(got ${foreignImage.status})`);
  const badRef = await admin.post(`/api/products/${productId}/images`, { publicId: '../../etc?x=1' });
  check('Malformed image reference rejected', badRef.status === 400 || badRef.status === 503, `(got ${badRef.status})`);
  const idProbe = await lister.get('/api/products/zzz');
  check('Malformed IDs handled safely', idProbe.status === 404);

  console.log('\nInventory history');
  const add = await admin.post(`/api/products/${productId}/stock`, { type: 'add', quantity: 5, reason: 'Restock' });
  check('Stock add 20 → 25', add.status === 201 && add.data.stock === 25);
  const tooMany = await admin.post(`/api/products/${productId}/stock`, { type: 'remove', quantity: 999, reason: 'Oops' });
  check('Cannot remove more than available', tooMany.status === 409);
  const noReason = await admin.post(`/api/products/${productId}/stock`, { type: 'remove', quantity: 1 });
  check('Reduction requires a reason', noReason.status === 400);
  const remove = await admin.post(`/api/products/${productId}/stock`, { type: 'remove', quantity: 23, reason: 'Sold' });
  check('Stock remove 25 → 2', remove.status === 201 && remove.data.stock === 2);
  const history = await admin.get(`/api/products/${productId}/stock`);
  check('Movement history has initial + 2 entries', history.data.movements.length === 3 && history.data.movements[2].type === 'initial');
  const editStock = await admin.patch(`/api/products/${productId}`, { ...product, categoryId, stock: 999 });
  const reloaded = await admin.get(`/api/products/${productId}`);
  check('Product edit cannot silently overwrite stock', editStock.status === 200 && reloaded.data.product.stock === 2);
  check('Low-stock flag set (2 ≤ 3)', reloaded.data.product.isLowStock === true);
  const low = await admin.get('/api/products?lowStock=1');
  check('Admin low-stock filter finds product', low.data.items.some((p) => p.id === productId));

  console.log('\nCategory field rename migrates values');
  const catNow = (await admin.get(`/api/categories/${categoryId}`)).data.category;
  const renamed = catNow.fields.map((f) => (f.key === 'compatible_model' ? { ...f, key: 'phone_model', label: 'Phone model' } : f));
  const ren = await admin.patch(`/api/categories/${categoryId}`, { fields: renamed });
  const afterRename = await admin.get(`/api/products/${productId}`);
  check('Renamed field keeps product value', ren.status === 200 && afterRename.data.product.customFields.phone_model === 'iPhone 15');

  console.log('\nCSRF protection');
  const csrf = await admin.request('POST', '/api/users', { name: 'X', email: `csrf${RUN}@example.test`, password: 'password123' }, { origin: 'https://evil.example' });
  check('Cross-origin POST blocked', csrf.status === 403);

  console.log('\nDeactivation and password reset');
  const deact = await admin.patch(`/api/users/${listerId}`, { isActive: false });
  check('Admin deactivates listing user', deact.status === 200 && deact.data.user.isActive === false);
  check('Existing session loses access immediately', (await lister.get('/api/products')).status === 401);
  check('Deactivated user cannot sign in', (await new Client().login(listerEmail, 'TempPass-123')).status === 403);
  await admin.patch(`/api/users/${listerId}`, { isActive: true });
  const relogin = await lister.login(listerEmail, 'TempPass-123');
  check('Reactivated user can sign in', relogin.status === 200);
  const reset = await admin.patch(`/api/users/${listerId}`, { password: 'NewTemp-456' });
  check('Admin resets password', reset.status === 200 && reset.data.user.mustChangePassword === true);
  check('Password reset ends existing session', (await lister.get('/api/products')).status === 401);
  check('Old password no longer works', (await new Client().login(listerEmail, 'TempPass-123')).status === 401);
  check('New password works', (await lister.login(listerEmail, 'NewTemp-456')).status === 200);
  const selfChange = await lister.post('/api/auth/password', { currentPassword: 'NewTemp-456', newPassword: 'MyOwnPass-789' });
  check('User changes own password', selfChange.status === 200);
  const me = await lister.get('/api/auth/me');
  check('Temporary-password flag cleared', me.status === 200 && me.data.user.mustChangePassword === false);
  const selfDeact = await admin.patch(`/api/users/${adminLogin.data.user.id}`, { isActive: false });
  check('Admin cannot deactivate themselves', selfDeact.status === 400);

  console.log('\nLogout');
  await lister.post('/api/auth/logout');
  check('Logged-out session rejected', (await lister.get('/api/auth/me')).status === 401);
}

try {
  await main();
} catch (err) {
  failed += 1;
  console.error('\nTest run aborted:', err);
} finally {
  // Remove test data in reverse order (user and products before the category).
  for (const task of cleanup.reverse()) {
    try {
      await task();
    } catch {}
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
