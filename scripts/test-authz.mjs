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

  const noCategory = await admin.post('/api/products', { name: `No category ${RUN}` });
  check('Creating a product without a category → 400', noCategory.status === 400 && noCategory.data?.details?.categoryId === 'Choose a category', JSON.stringify(noCategory.data));
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

  const zeroPrice = await admin.post('/api/products', { name: `Zero ${RUN}`, categoryId, customFields: { compatible_model: 'X' }, purchaseCost: 50, sellingPrice: 0 });
  check('Zero selling price → margin null (no division error)', zeroPrice.status === 201 && zeroPrice.data.product.pricing.margin === null && zeroPrice.data.product.pricing.profit === -50);
  cleanup.push(() => admin.del(`/api/products/${zeroPrice.data.product.id}`));

  const inactive = await admin.post('/api/products', { name: `Hidden ${RUN}`, categoryId, customFields: { compatible_model: 'X' }, status: 'inactive' });
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
  // Resellers need a running plan; all-category access keeps the checks below independent of scope.
  const comp = await admin.post(`/api/users/${listerId}/plan`, { action: 'comp', days: 30 });
  check('Admin comps the listing user 30 days', comp.status === 200, `(got ${comp.status})`);
  const allAccess = await admin.put(`/api/users/${listerId}/access`, { adminMode: 'all', adminCategoryIds: [] });
  check('Admin grants all categories', allAccess.status === 200, `(got ${allAccess.status})`);
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

  // Shared listings are admin-write only; each reseller tracks their own work.
  const statusUpdate = await lister.patch(`/api/listings/${listingId}`, { status: 'in_progress' });
  check('Listing user cannot change shared listing status → 403', statusUpdate.status === 403, `(got ${statusUpdate.status})`);
  const titleHack = await lister.patch(`/api/listings/${listingId}`, { title: 'Hacked' });
  check('Listing user cannot edit listing title', titleHack.status === 403);
  const note = await lister.post(`/api/listings/${listingId}/notes`, { text: 'Listed draft on Meesho' });
  check('Listing user cannot add a shared note → 403', note.status === 403, `(got ${note.status})`);
  const adminNote = await admin.post(`/api/listings/${listingId}/notes`, { text: 'Admin-only note' });
  check('Admin can add a shared note', adminNote.status === 201);
  const sharedView = await lister.get(`/api/listings/${listingId}`);
  check('Shared listing hides notes, history and editor from listing user', sharedView.status === 200 && !('notes' in sharedView.data.listing) && !('previousVersions' in sharedView.data.listing) && !('updatedByName' in sharedView.data.listing));
  const productListings = await lister.get(`/api/products/${productId}/listings`);
  check('Product listings hide notes from listing user', productListings.status === 200 && !JSON.stringify(productListings.data).includes('Admin-only note'));

  const version = { portal: 'meesho', title: 'Matte iPhone 15 Back Cover', description: 'New text', styleId: 'mat ip15-cvr', sku: 'sku 001' };
  const applied = await lister.put(`/api/products/${productId}/listing-version`, version);
  check('Listing-version save by listing user lands in their tracker', applied.status === 200 && applied.data.tracker?.savedVersions?.[0]?.title === version.title, JSON.stringify(applied.data));
  check('Codes normalised (uppercase, hyphens)', applied.data?.tracker?.savedVersions?.[0]?.styleId === 'MAT-IP15-CVR' && applied.data?.tracker?.savedVersions?.[0]?.sku === 'SKU-001');
  const sharedAfterVersion = await admin.get(`/api/listings/${listingId}`);
  check('Listing-version save by listing user leaves the shared listing alone', sharedAfterVersion.data.listing.title === 'Matte iPhone 15 cover' && sharedAfterVersion.data.listing.previousVersions.length === 0);
  check('Version save with a bad portal → 400', (await lister.put(`/api/products/${productId}/listing-version`, { ...version, portal: 'myspace' })).status === 400);
  check('Version save on hidden product → 404', (await lister.put(`/api/products/${inactiveId}/listing-version`, version)).status === 404);
  check('Version save without login → 401', (await anon.put(`/api/products/${productId}/listing-version`, version)).status === 401);
  check('Version save needs a title', (await lister.put(`/api/products/${productId}/listing-version`, { ...version, title: '' })).status === 400);
  const adminVersion = await admin.put(`/api/products/${productId}/listing-version`, { marketplace: 'meesho', title: 'Admin title', description: 'x', styleId: 'adm 1', sku: 'adm 2' });
  check('Admin listing-version save updates the shared listing', adminVersion.status === 200 && adminVersion.data.listing.title === 'Admin title');
  check('Replaced values kept as a previous version', adminVersion.data?.listing?.previousVersions?.[0]?.title === 'Matte iPhone 15 cover');
  check('Saving a version cannot touch other fields', adminVersion.data?.listing?.status === 'not_started' && adminVersion.data?.listing?.attributes?.length === 1);
  const restored = await admin.patch(`/api/listings/${listingId}`, { ...listing.data.listing, status: 'in_progress', title: 'Matte iPhone 15 cover', styleId: `STYLE-${RUN}` });
  const mixed = await lister.patch(`/api/listings/${listingId}`, { status: 'listed', styleId: 'HACK', suggestedPrice: 1 });
  check('Listing user cannot sneak content fields alongside status', mixed.status === 403);
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


  console.log('\nReseller isolation');
  // Second category with its own product; two resellers each granted one category.
  const cat2 = await admin.post('/api/categories', { name: `Test Bags ${RUN}` });
  check('Admin creates a second category', cat2.status === 201);
  const category2Id = cat2.data.category?.id;
  const prod2 = await admin.post('/api/products', { name: `Secret Bag ${RUN}`, sku: `B-${RUN}`, categoryId: category2Id, sellingPrice: 199 });
  check('Admin creates product in second category', prod2.status === 201);
  const product2Id = prod2.data.product?.id;
  cleanup.push(() => admin.del(`/api/categories/${category2Id}`));
  cleanup.push(() => admin.del(`/api/products/${product2Id}`));
  const listing2 = await admin.post('/api/listings', { productId: product2Id, marketplace: 'meesho', title: 'Bag listing' });
  const listing2Id = listing2.data.listing?.id;

  const resellers = [];
  for (const [label, catId] of [['A', categoryId], ['B', category2Id]]) {
    const email = `reseller${label.toLowerCase()}-${RUN}@example.test`;
    const made = await admin.post('/api/users', { name: `Reseller ${label}`, email, password: 'TempPass-123' });
    const id = made.data.user?.id;
    cleanup.push(() => admin.del(`/api/users/${id}`));
    await admin.post(`/api/users/${id}/plan`, { action: 'comp', days: 30 });
    const acc = await admin.put(`/api/users/${id}/access`, { adminMode: 'selected', adminCategoryIds: [catId] });
    check(`Reseller ${label} gets one category`, made.status === 201 && acc.status === 200, `(got ${made.status}/${acc.status})`);
    const client = new Client();
    const login = await client.login(email, 'TempPass-123');
    check(`Reseller ${label} signs in with an active plan`, login.status === 200 && login.data.user.plan?.active === true && login.data.user.access?.all === false);
    resellers.push({ id, client });
  }
  const [ra, rb] = resellers.map((r) => r.client);

  const raList = await ra.get('/api/products');
  check('Reseller A list shows only their category', raList.status === 200 && raList.data.items.some((p) => p.id === productId) && !raList.data.items.some((p) => p.id === product2Id));
  const raCat = await ra.get(`/api/products?category=${category2Id}`);
  check('Reseller A ?category= of another category returns nothing', raCat.status === 200 && raCat.data.total === 0);
  const raSearch = await ra.get(`/api/products?q=${encodeURIComponent(`Secret Bag ${RUN}`)}`);
  check('Reseller A search cannot find other category', raSearch.status === 200 && raSearch.data.total === 0);
  const raCatSearch = await ra.get(`/api/products?q=${encodeURIComponent(`Test Bags ${RUN}`)}`);
  check('Reseller A category-name search stays in scope', raCatSearch.status === 200 && raCatSearch.data.total === 0);
  const rbList = await rb.get('/api/products');
  check('Reseller B list shows only their category', rbList.status === 200 && rbList.data.items.some((p) => p.id === product2Id) && !rbList.data.items.some((p) => p.id === productId));
  check('Reseller A product detail of other category → 404', (await ra.get(`/api/products/${product2Id}`)).status === 404);
  check('Reseller A product listings of other category → 404', (await ra.get(`/api/products/${product2Id}/listings`)).status === 404);
  check('Reseller A shared listing of other category → 404', (await ra.get(`/api/listings/${listing2Id}`)).status === 404);
  const raListings = await ra.get('/api/listings');
  check('Reseller A listings list excludes other category', raListings.status === 200 && !raListings.data.listings.some((l) => l.productId === product2Id));
  check('Reseller A generate on other category → 404', (await ra.post(`/api/products/${product2Id}/listing-version`, { marketplace: 'meesho' })).status === 404);
  check('Reseller A version save on other category → 404', (await ra.put(`/api/products/${product2Id}/listing-version`, { title: 'x' })).status === 404);
  const raCats = await ra.get('/api/categories');
  check('Reseller A categories list only theirs', raCats.status === 200 && raCats.data.categories.some((c) => c.id === categoryId) && !raCats.data.categories.some((c) => c.id === category2Id));
  check('Reseller A category detail of other category → 404', (await ra.get(`/api/categories/${category2Id}`)).status === 404);
  const raDash = await ra.get('/api/dashboard');
  check('Reseller dashboard has plan, support and scoped counts', raDash.status === 200 && raDash.data.plan?.active === true && raDash.data.support && typeof raDash.data.available === 'number');
  check('Reseller dashboard has no cost data', !/stockCostValue|averageMargin|pricing|inventory/.test(JSON.stringify(raDash.data)));

  console.log('\nReseller tracker');
  const track = await ra.put(`/api/my-listings/${productId}`, { portal: 'meesho', status: 'listed', userId: resellers[1].id });
  check('Reseller A sets own status', track.status === 200 && track.data.tracker.status === 'listed');
  const badPortal = await ra.put(`/api/my-listings/${productId}`, { portal: 'myspace', status: 'listed' });
  check('Tracker rejects unknown portal', badPortal.status === 400);
  const badTrackStatus = await ra.put(`/api/my-listings/${productId}`, { portal: 'meesho', status: 'published' });
  check('Tracker rejects unknown status', badTrackStatus.status === 400);
  check('Tracker on other category → 404', (await ra.put(`/api/my-listings/${product2Id}`, { portal: 'meesho', status: 'listed' })).status === 404);
  const trackNote = await ra.post(`/api/my-listings/${productId}/notes`, { portal: 'meesho', text: `private note ${RUN}` });
  check('Reseller A adds a private note', trackNote.status === 201);
  const raMine = await ra.get('/api/my-listings');
  check('Reseller A sees own tracker with product summary', raMine.status === 200 && raMine.data.items.some((t) => t.productId === productId && t.status === 'listed' && t.product?.name));
  check('Tracker rows carry no cost or stock data', leaksSensitive(raMine.data).length === 0, leaksSensitive(raMine.data).join(','));
  const rbMine = await rb.get('/api/my-listings');
  check('Reseller B does not see A\'s tracker (userId in body ignored)', rbMine.status === 200 && rbMine.data.total === 0);
  const raFiltered = await ra.get('/api/my-listings?status=paused');
  check('Tracker status filter works', raFiltered.status === 200 && raFiltered.data.total === 0);
  const raProducts = await ra.get('/api/products?listingStatus=listed');
  check('Product list status comes from own tracker', raProducts.data.items.some((p) => p.id === productId && p.listingStatus === 'listed'));
  const sharedStill = await admin.get(`/api/listings/${listingId}`);
  check('Tracker never changes the shared listing', sharedStill.data.listing.status === 'in_progress' && !JSON.stringify(sharedStill.data).includes(`private note ${RUN}`));
  check('Admin has no personal tracker → 403', (await admin.get('/api/my-listings')).status === 403);
  const delTrack = await ra.del(`/api/my-listings/${productId}?portal=meesho`);
  check('Reseller A deletes own tracker entry', delTrack.status === 200 && (await ra.get('/api/my-listings')).data.total === 0);

  console.log('\nExpired plan');
  const revoke = await admin.post(`/api/users/${resellers[0].id}/plan`, { action: 'revoke' });
  check('Admin revokes reseller A', revoke.status === 200, `(got ${revoke.status})`);
  const expiredList = await ra.get('/api/products');
  check('Expired reseller → 402 on /api/products', expiredList.status === 402 && (expiredList.data?.code === 'plan_expired' || expiredList.data?.details?.code === 'plan_expired'), `(got ${expiredList.status})`);
  check('Expired reseller → 402 on /api/my-listings', (await ra.get('/api/my-listings')).status === 402);
  const expiredMe = await ra.get('/api/auth/me');
  check('Expired reseller can still read /api/auth/me', expiredMe.status === 200 && expiredMe.data.user.plan?.active === false);
  const preview = await ra.get('/api/preview');
  check('Expired reseller gets a preview', preview.status === 200 && Array.isArray(preview.data.cards) && preview.data.cards.length <= 24);
  check('Preview has no product names, ids or Cloudinary URLs', !preview.text.includes('Test Product') && !preview.text.includes(productId) && !preview.text.includes('cloudinary') && !preview.text.includes('Secret Bag'));
  check('Preview image with a forged token → 404', (await ra.get('/api/preview/image/not-a-token')).status === 404);
  check('Admin cannot use preview → 403', (await admin.get('/api/preview')).status === 403);
  const expiredPage = await ra.get('/dashboard');
  check('Expired reseller page redirects to /renew', [302, 303, 307, 308].includes(expiredPage.status) || String(expiredPage.text).includes('/renew'), `(got ${expiredPage.status})`);

  console.log('\nLogout');
  await lister.post('/api/auth/logout');
  check('Logged-out session rejected', (await lister.get('/api/auth/me')).status === 401);

  // ---- Commerce (plans, checkout, coupons, subscriptions, payments) ----
  console.log('\nCommerce: admin-only routes');
  // `rb` (reseller B, active plan) comes from the isolation section above.
  const couponMade = await admin.post('/api/coupons', { code: `T-${RUN}`.toUpperCase(), kind: 'percent_off', value: 100, plans: ['m1'], maxUses: 5 });
  check('Admin creates coupon', couponMade.status === 201 && couponMade.data.coupon.code === `T-${RUN}`.toUpperCase(), JSON.stringify(couponMade.data));
  const couponId = couponMade.data.coupon?.id;
  cleanup.push(() => admin.del(`/api/coupons/${couponId}`));
  const adminOnly = [
    ['GET', '/api/coupons'],
    ['POST', '/api/coupons', { code: 'EVIL-1', kind: 'final_price', value: 100, plans: ['m1'] }],
    ['PATCH', `/api/coupons/${couponId}`, { isActive: false }],
    ['DELETE', `/api/coupons/${couponId}`],
    ['GET', '/api/subscriptions'],
    ['GET', '/api/payments'],
    ['PATCH', '/api/payments/000000000000000000000000', { markPaid: true }],
    ['POST', `/api/users/${resellers[1].id}/plan`, { action: 'comp', days: 365 }],
    ['PUT', `/api/users/${resellers[1].id}/access`, { adminMode: 'all' }],
    ['POST', `/api/users/${resellers[1].id}/resend-welcome`],
  ];
  for (const [m, p, b] of adminOnly) {
    check(`Reseller ${m} ${p} → 403`, (await rb.request(m, p, b)).status === 403);
    check(`Anonymous ${m} ${p} → 401`, (await anon.request(m, p, b)).status === 401);
  }
  check('Cron without secret → 401', (await anon.get('/api/cron/daily')).status === 401);
  check('Cron with wrong secret → 401', (await anon.request('GET', '/api/cron/daily', undefined, { authorization: 'Bearer wrong' })).status === 401);

  console.log('\nCommerce: coupon validation');
  for (const [label, body] of [
    ['short code', { code: 'AB', kind: 'percent_off', value: 10, plans: ['m1'] }],
    ['bad characters', { code: 'BAD_CODE!', kind: 'percent_off', value: 10, plans: ['m1'] }],
    ['final price below 100 paise', { code: `F-${RUN}`, kind: 'final_price', value: 50, plans: ['m1'] }],
    ['percent 0', { code: `P-${RUN}`, kind: 'percent_off', value: 0, plans: ['m1'] }],
    ['percent over 100', { code: `P-${RUN}`, kind: 'percent_off', value: 101, plans: ['m1'] }],
    ['no plans', { code: `N-${RUN}`, kind: 'percent_off', value: 10, plans: [] }],
    ['unknown grant category', { code: `G-${RUN}`, kind: 'percent_off', value: 10, plans: ['m1'], grants: { categoryAccess: ['000000000000000000000000'] } }],
  ]) {
    check(`Coupon rejected: ${label}`, (await admin.post('/api/coupons', body)).status === 400);
  }
  check('Duplicate coupon code → 409', (await admin.post('/api/coupons', { code: `t-${RUN}`, kind: 'percent_off', value: 10, plans: ['m1'] })).status === 409);
  const couponPatch = await admin.patch(`/api/coupons/${couponId}`, { note: 'test note' });
  check('Admin edits coupon', couponPatch.status === 200 && couponPatch.data.coupon.note === 'test note');
  check('Unknown access category rejected', (await admin.put(`/api/users/${resellers[1].id}/access`, { adminMode: 'selected', adminCategoryIds: ['000000000000000000000000'] })).status === 400);
  check('Plan action validated', (await admin.post(`/api/users/${resellers[1].id}/plan`, { action: 'forever', days: 1 })).status === 400);
  check('Plan cannot be given to an admin', (await admin.post(`/api/users/${adminLogin.data.user.id}/plan`, { action: 'comp', days: 1 })).status === 400);

  console.log('\nCommerce: public checkout');
  const plansRes = await anon.get('/api/plans');
  check('Plans are public', plansRes.status === 200 && plansRes.data.plans.map((p) => p.code).join() === 'm1,m3' && plansRes.data.launchOffer?.paise === 9900);
  const cats = await anon.get('/api/checkout/categories');
  check('Checkout categories are public and carry no costs', cats.status === 200 && Array.isArray(cats.data.categories) && leaksSensitive(cats.data).length === 0);
  const buyerEmail = `buyer-${RUN}@example.test`;
  const badCoupon = await anon.post('/api/checkout/quote', { planCode: 'm1', email: buyerEmail, phone: '9876500000', couponCode: 'NOT-A-REAL-ONE' });
  check('Unknown coupon → generic coupon error', badCoupon.status === 200 && badCoupon.data.couponError === 'Coupon not valid for this purchase');
  const wrongPlanCoupon = await anon.post('/api/checkout/quote', { planCode: 'm3', email: buyerEmail, phone: '9876500000', couponCode: `T-${RUN}` });
  check('Coupon for another plan → same generic error', wrongPlanCoupon.data.couponError === 'Coupon not valid for this purchase');
  const goodCoupon = await anon.post('/api/checkout/quote', { planCode: 'm1', email: buyerEmail, phone: '9876500000', couponCode: `t-${RUN}` });
  check('100% coupon clamps to 100 paise', goodCoupon.data.finalPaise === 100 && goodCoupon.data.couponApplied === true && goodCoupon.data.pickCategories?.max === 2);
  check('Quote rejects a non-Indian phone', (await anon.post('/api/checkout/quote', { planCode: 'm1', email: buyerEmail, phone: '12345' })).status === 400);
  check('Honeypot blocks the order', (await anon.post('/api/checkout/order', { name: 'Bot', email: buyerEmail, phone: '9876500000', planCode: 'm1', website: 'http://spam' })).status === 400);
  check('Admin email cannot buy', (await anon.post('/api/checkout/order', { name: 'X', email: ADMIN_EMAIL, phone: '9876500001', planCode: 'm1' })).status === 400);
  check('Status of an unknown order → 404', (await anon.get('/api/checkout/status?order=order_doesnotexist')).status === 404);
  const forged = await anon.request('POST', '/api/webhooks/razorpay', { event: 'payment.captured' }, { 'x-razorpay-signature': 'forged' });
  check('Webhook with a forged signature is refused', forged.status === 400 || forged.status === 503, `(got ${forged.status})`);

  const mode = (await admin.get('/api/payments')).data?.mode;
  if (mode !== 'mock') {
    console.log(`  (skipping mock purchase checks: PAYMENT_MODE is ${mode || 'unknown'}; run the server with PAYMENT_MODE=mock)`);
    check('mock-complete hidden outside mock mode', (await anon.post('/api/checkout/mock-complete', { orderId: 'x', outcome: 'paid' })).status === 404);
  } else {
    console.log('\nCommerce: mock purchase');
    const order = await anon.post('/api/checkout/order', { name: 'Test Buyer', email: buyerEmail, phone: '9876500002', planCode: 'm1', categoryIds: [categoryId] });
    check('Order created (mock)', order.status === 201 && order.data.provider === 'mock' && order.data.amountPaise === 9900 && !order.data.keyId, JSON.stringify(order.data));
    const orderId = order.data.orderId;
    check('New order is pending', (await anon.get(`/api/checkout/status?order=${orderId}`)).data.status === 'pending');
    const paid = await anon.post('/api/checkout/mock-complete', { orderId, outcome: 'paid' });
    check('Mock payment fulfilled with a new account', paid.status === 200 && paid.data.status === 'fulfilled' && paid.data.newAccount === true && paid.data.maskedEmail?.includes('***'));
    const again = await anon.post('/api/checkout/mock-complete', { orderId, outcome: 'paid' });
    check('Repeating fulfilment is harmless', again.status === 200 && again.data.status === 'fulfilled');
    check('Status shows fulfilled', (await anon.get(`/api/checkout/status?order=${orderId}`)).data.status === 'fulfilled');
    const subs = await admin.get('/api/subscriptions');
    const buyer = subs.data.resellers?.find((r) => r.email === buyerEmail);
    if (buyer) cleanup.push(() => admin.del(`/api/users/${buyer.id}`));
    check('Buyer listed with active m1 plan and picked category', buyer?.plan?.active === true && buyer.planCode === 'm1' && buyer.access.categories.some((c) => c.id === categoryId));
    check('Admin sees the temporary password', typeof buyer?.pendingPassword === 'string' && buyer.pendingPassword.length === 10);
    check('Subscriptions list leaks no hashes or encrypted secrets', !subs.text.includes('passwordHash') && !subs.text.includes('pendingCredential') && !subs.text.includes('scrypt$'));
    const buyerClient = new Client();
    check('Buyer signs in with the temporary password', (await buyerClient.login(buyerEmail, buyer?.pendingPassword)).status === 200);
    const renewQuote = await anon.post('/api/checkout/quote', { planCode: 'm1', email: buyerEmail, phone: '9876500002' });
    check('Launch offer not offered twice', renewQuote.data.offerApplied === false && renewQuote.data.finalPaise === 29900);
    const order2 = await anon.post('/api/checkout/order', { name: 'Test Buyer', email: buyerEmail, phone: '9876500002', planCode: 'm1' });
    const paid2 = await anon.post('/api/checkout/mock-complete', { orderId: order2.data.orderId, outcome: 'paid' });
    check('Second purchase extends the existing account', paid2.data.status === 'fulfilled' && paid2.data.newAccount === false);
    check('Existing password unchanged by a second purchase', (await new Client().login(buyerEmail, buyer?.pendingPassword)).status === 200);
    const order3 = await anon.post('/api/checkout/order', { name: 'Test Buyer', email: buyerEmail, phone: '9876500002', planCode: 'm3' });
    const failedPay = await anon.post('/api/checkout/mock-complete', { orderId: order3.data.orderId, outcome: 'failed' });
    check('Failed mock payment recorded', failedPay.data.status === 'failed' && (await anon.get(`/api/checkout/status?order=${order3.data.orderId}`)).data.status === 'failed');
    const list = await admin.get('/api/payments?status=fulfilled');
    check('Admin lists fulfilled payments', list.status === 200 && list.data.items.some((p) => p.providerOrderId === orderId) && !list.text.includes('ipHash'));
    const refundTarget = list.data.items.find((p) => p.providerOrderId === order2.data.orderId);
    const refund = await admin.patch(`/api/payments/${refundTarget?.id}`, { refundNote: 'Test refund', revokeDays: 30 });
    check('Admin records a refund and removes the days', refund.status === 200 && refund.data.payment.status === 'refunded');
    const resend = await admin.post(`/api/users/${buyer?.id}/resend-welcome`);
    check('Admin resends welcome (new password)', resend.status === 200 && resend.data.user.hasPendingPassword === true);
    check('Resend ends the buyer session', (await buyerClient.get('/api/auth/me')).status === 401);

    // Each section below sends its own client IP so the per-IP order limit (10/hour) is not hit.
    const DAY = 24 * 60 * 60 * 1000;
    const near = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 5 * 60 * 1000;
    const ip = (n) => ({ 'x-real-ip': `10.99.${n}.1` });
    const userById = async (id) => (await admin.get(`/api/users/${id}`)).data.user;

    console.log('\nCommerce: buying for someone else');
    const buyerBefore = await userById(buyer?.id);
    const strangerOrder = await anon.request('POST', '/api/checkout/order', { name: 'Stranger', email: buyerEmail, phone: '9876500077', planCode: 'm1', categoryIds: [category2Id] }, ip(1));
    check('Stranger can order for an existing email', strangerOrder.status === 201, JSON.stringify(strangerOrder.data));
    const strangerPaid = await anon.request('POST', '/api/checkout/mock-complete', { orderId: strangerOrder.data?.orderId, outcome: 'paid' }, ip(1));
    const buyerAfter = await userById(buyer?.id);
    check('Stranger purchase fulfilled on the existing account', strangerPaid.data?.status === 'fulfilled' && strangerPaid.data.newAccount === false);
    check("Stranger cannot change the reseller's own categories", JSON.stringify(buyerAfter.categoryAccess.selfCategoryIds) === JSON.stringify(buyerBefore.categoryAccess.selfCategoryIds) && !buyerAfter.categoryAccess.selfCategoryIds.includes(category2Id));
    check('Stranger purchase adds 30 days on top (never shortens)', near(buyerAfter.planEndsAt, new Date(buyerBefore.planEndsAt).getTime() + 30 * DAY), `${buyerBefore.planEndsAt} -> ${buyerAfter.planEndsAt}`);
    const mismatch = await rb.request('POST', '/api/checkout/order', { name: 'B', email: `someone-else-${RUN}@example.test`, phone: '9876500078', planCode: 'm1' }, ip(2));
    check('Signed-in reseller ordering for another email → 400 email_mismatch', mismatch.status === 400 && mismatch.data?.details?.code === 'email_mismatch' && /email/i.test(mismatch.data?.error || ''), JSON.stringify(mismatch.data));
    const mismatchQuote = await rb.request('POST', '/api/checkout/quote', { email: `someone-else-${RUN}@example.test`, phone: '9876500078', planCode: 'm1' }, ip(2));
    check('Signed-in reseller quoting for another email → 400', mismatchQuote.status === 400 && mismatchQuote.data?.details?.code === 'email_mismatch');

    console.log('\nCommerce: one-use coupon, three parallel orders');
    const oneCode = `ONE-${RUN}`.toUpperCase();
    const oneCoupon = await admin.post('/api/coupons', { code: oneCode, kind: 'final_price', value: 100, plans: ['m1'], maxUses: 1 });
    check('Admin creates a one-use coupon', oneCoupon.status === 201, JSON.stringify(oneCoupon.data));
    const oneCouponId = oneCoupon.data.coupon?.id;
    cleanup.push(() => admin.del(`/api/coupons/${oneCouponId}`));
    check('Coupon codes shorter than 8 characters rejected', (await admin.post('/api/coupons', { code: 'SHORT1', kind: 'percent_off', value: 10, plans: ['m1'] })).status === 400);
    const parallel = await Promise.all(
      [0, 1, 2].map((n) =>
        anon.request('POST', '/api/checkout/order', { name: `Racer ${n}`, email: `racer${n}-${RUN}@example.test`, phone: `98765001${n}0`, planCode: 'm1', couponCode: oneCode }, ip(10 + n))
      )
    );
    const winners = parallel.filter((r) => r.status === 201 && r.data.amountPaise === 100 && r.data.couponApplied === true);
    const losers = parallel.filter((r) => r.status === 400 && r.data?.error === 'Coupon not valid for this purchase');
    check('Only one parallel order gets the one-use coupon, the others get the generic error', winners.length === 1 && losers.length === 2, JSON.stringify(parallel.map((r) => [r.status, r.data?.amountPaise, r.data?.error])));
    const couponNow = async () => (await admin.get('/api/coupons')).data.coupons?.find((c) => c.code === oneCode);
    const held = await couponNow();
    check('Winning order holds the use (reserved, not yet used)', held?.reservedCount === 1 && held?.usedCount === 0, JSON.stringify(held));
    check('A held coupon cannot be deleted', (await admin.del(`/api/coupons/${oneCouponId}`)).status === 409);
    if (winners[0]) await anon.request('POST', '/api/checkout/mock-complete', { orderId: winners[0].data.orderId, outcome: 'failed' }, ip(10));
    const released = await couponNow();
    check('Failed payment gives the coupon use back', released?.reservedCount === 0 && released?.usedCount === 0, JSON.stringify(released));
    const reuse = await anon.request('POST', '/api/checkout/quote', { planCode: 'm1', email: `racer9-${RUN}@example.test`, phone: '9876500190', couponCode: oneCode }, ip(13));
    check('Released coupon is usable again', reuse.data?.couponApplied === true);

    console.log('\nCommerce: comp days, then purchases');
    const compEmail = `comp-${RUN}@example.test`;
    const compMade = await admin.post('/api/users', { name: 'Comp Reseller', email: compEmail, password: 'TempPass-123' });
    const compId = compMade.data.user?.id;
    cleanup.push(() => admin.del(`/api/users/${compId}`));
    await admin.post(`/api/users/${compId}/plan`, { action: 'comp', days: 10 });
    const compBefore = await userById(compId);
    const compClient = new Client();
    await compClient.login(compEmail, 'TempPass-123');
    const compOrder = await compClient.request('POST', '/api/checkout/order', { name: 'Comp Reseller', email: compEmail, phone: '9876500201', planCode: 'm1' }, ip(20));
    const compPaid = await anon.request('POST', '/api/checkout/mock-complete', { orderId: compOrder.data?.orderId, outcome: 'paid' }, ip(20));
    const compAfter = await userById(compId);
    check('Comp user purchase fulfilled', compOrder.status === 201 && compPaid.data?.status === 'fulfilled', JSON.stringify([compOrder.data, compPaid.data]));
    check('Comp days kept; 30 paid days added on top', compAfter.planCode === 'm1' && near(compAfter.planEndsAt, new Date(compBefore.planEndsAt).getTime() + 30 * DAY), `${compBefore.planEndsAt} -> ${compAfter.planEndsAt}`);

    const m3Order = await compClient.request('POST', '/api/checkout/order', { name: 'Comp Reseller', email: compEmail, phone: '9876500201', planCode: 'm3' }, ip(21));
    const m3Paid = await anon.request('POST', '/api/checkout/mock-complete', { orderId: m3Order.data?.orderId, outcome: 'paid' }, ip(21));
    const m3User = await userById(compId);
    check('m3 purchase stacks and gives all access to the plan end', m3Paid.data?.status === 'fulfilled' && near(m3User.planEndsAt, new Date(compAfter.planEndsAt).getTime() + 90 * DAY) && near(m3User.allAccessUntil, m3User.planEndsAt));
    const ext = await admin.post(`/api/users/${compId}/plan`, { action: 'extend', days: 15 });
    check('Admin extend of an m3 reseller keeps all access to the new end', ext.status === 200 && near(ext.data.user.planEndsAt, new Date(m3User.planEndsAt).getTime() + 15 * DAY) && near(ext.data.user.allAccessUntil, ext.data.user.planEndsAt) && ext.data.plan?.tier === 'all', JSON.stringify(ext.data?.user));
    const compM3 = await admin.post(`/api/users/${compId}/plan`, { action: 'comp', days: 5 });
    check('Admin comp of an m3 reseller keeps all access too', compM3.status === 200 && near(compM3.data.user.allAccessUntil, compM3.data.user.planEndsAt));
    const extPlain = await admin.post(`/api/users/${resellers[1].id}/plan`, { action: 'extend', days: 5 });
    check('Admin extend of a non-all reseller does not grant all access', extPlain.status === 200 && !extPlain.data.user.allAccessUntil && extPlain.data.plan?.tier !== 'all');

    check('Admin deletes an unused coupon', (await admin.del(`/api/coupons/${couponId}`)).status === 200);
  }
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
