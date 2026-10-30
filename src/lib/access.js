// Category access and plan state for resellers (role `listing_user`).
// Kept free of auth.js imports so auth.js can use it without a cycle.
import { getDb, toObjectId } from './db';
import { notFound } from './api';
import { ROLES } from './constants';
import { OPEN_CATALOG, getPlan, selfLimitForPlan } from './plans';

const DAY_MS = 24 * 60 * 60 * 1000;

const isAdminUser = (user) => user?.role === ROLES.ADMIN;
const inFuture = (value, now) => Boolean(value) && new Date(value).getTime() > now.getTime();

// Stored ids may be ObjectIds or (from older writes) strings; returns unique ObjectIds.
export function normaliseIds(values) {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const objectId = toObjectId(value ? String(value) : '');
    if (!objectId || seen.has(objectId.toString())) continue;
    seen.add(objectId.toString());
    out.push(objectId);
  }
  return out;
}

export function hasAllAccess(user, now = new Date()) {
  return inFuture(user?.allAccessUntil, now);
}

// Rules apply in this order: admin, OPEN_CATALOG (every plan sees everything), all-access window, admin "all" grant,
// otherwise the union of admin-granted and self-picked categories.
export function categoryScope(user, now = new Date()) {
  if (isAdminUser(user)) return { all: true };
  if (OPEN_CATALOG) return { all: true };
  if (hasAllAccess(user, now)) return { all: true };
  const access = user?.categoryAccess || {};
  if (access.adminMode === 'all') return { all: true };
  return { all: false, categoryIds: normaliseIds([...(access.adminCategoryIds || []), ...(access.selfCategoryIds || [])]) };
}

// Mongo filter for products; combine with `$and`. Products without a
// category match only "all" scopes because `$in` never matches null.
export function productScopeMatch(user) {
  const scope = categoryScope(user);
  return scope.all ? {} : { categoryId: { $in: scope.categoryIds } };
}

export function isCategoryInScope(categoryId, user) {
  const scope = categoryScope(user);
  if (scope.all) return true;
  if (!categoryId) return false;
  const key = String(categoryId);
  return scope.categoryIds.some((id) => id.toString() === key);
}

export function isProductInScope(product, user) {
  return isCategoryInScope(product?.categoryId, user);
}

// 404 rather than 403 so out-of-scope products are indistinguishable from missing ones.
export function assertProductInScope(product, user) {
  if (!product || !isProductInScope(product, user)) throw notFound('Product not found');
  return product;
}

export function planState(user, now = new Date()) {
  if (isAdminUser(user)) return { active: true, endsAt: null, planCode: null, tier: 'all', daysLeft: null };
  const endsAt = user?.planEndsAt ? new Date(user.planEndsAt) : null;
  const active = inFuture(endsAt, now);
  const planCode = user?.planCode || null;
  const tier = hasAllAccess(user, now) ? 'all' : getPlan(planCode)?.tier || null;
  const daysLeft = active ? Math.ceil((endsAt.getTime() - now.getTime()) / DAY_MS) : 0;
  return { active, endsAt, planCode, tier, daysLeft };
}

// How many categories the reseller may pick themselves (0 = picking disabled).
export function selfLimit(user, now = new Date()) {
  if (isAdminUser(user)) return 0;
  if (user?.planCode !== 'm1' || !planState(user, now).active || hasAllAccess(user, now)) return 0;
  return selfLimitForPlan('m1');
}

export function accessSummary(user) {
  const scope = categoryScope(user);
  return { all: scope.all, categoryCount: scope.all ? null : scope.categoryIds.length };
}

// Active resellers (account enabled, plan running) who can see products of this category.
export async function resellersWithAccessTo(categoryId) {
  const objectId = toObjectId(categoryId ? String(categoryId) : '');
  if (!objectId) return [];
  const now = new Date();
  const db = await getDb();
  return db
    .collection('users')
    .find(
      {
        role: ROLES.LISTING_USER,
        isActive: true,
        planEndsAt: { $gt: now },
        ...(OPEN_CATALOG ? {} : { $or: [
          { allAccessUntil: { $gt: now } },
          { 'categoryAccess.adminMode': 'all' },
          { 'categoryAccess.adminCategoryIds': objectId },
          { 'categoryAccess.selfCategoryIds': objectId },
          // Ids written as strings by older code still count.
          { 'categoryAccess.adminCategoryIds': objectId.toString() },
          { 'categoryAccess.selfCategoryIds': objectId.toString() },
        ] }),
      },
      { projection: { passwordHash: 0, pendingCredential: 0 } }
    )
    .toArray();
}
