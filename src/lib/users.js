// User helpers shared by the user, subscription and checkout routes. Pure (no db),
// so it is safe to import anywhere. Missing fields (older/migrated users) read as null.

const idString = (value) => (value ? String(value) : null);
const idList = (values) => (Array.isArray(values) ? values.map(String) : []);

export function defaultCategoryAccess(now = new Date()) {
  return { adminMode: 'selected', adminCategoryIds: [], selfCategoryIds: [], selfChangedAt: null, updatedAt: now };
}

export function defaultEmailPrefs() {
  return { productUpdates: true, stockAlerts: true, reminders: true };
}

// Indian mobile: 10 digits starting 6-9, optionally written with +91 / 91 / 0 and spaces or dashes.
// Returns the bare 10 digits, or null when it is not a valid mobile number.
export function normalizePhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const compact = String(value).replace(/[\s\-().]/g, '');
  const match = compact.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return match ? match[1] : null;
}

// "ab***@gmail.com": enough for the buyer to recognise, not enough to harvest.
export function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  if (!domain) return '';
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
}

// Never returns passwordHash or pendingCredential (only whether one is waiting).
export function serializeUser(user) {
  const access = user.categoryAccess || {};
  const prefs = user.emailPrefs || defaultEmailPrefs();
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: Boolean(user.mustChangePassword),
    source: user.source || null,
    planCode: user.planCode || null,
    planSource: user.planSource || null,
    planStartedAt: user.planStartedAt || null,
    planEndsAt: user.planEndsAt || null,
    allAccessUntil: user.allAccessUntil || null,
    categoryAccess: {
      adminMode: access.adminMode === 'all' ? 'all' : 'selected',
      adminCategoryIds: idList(access.adminCategoryIds),
      selfCategoryIds: idList(access.selfCategoryIds),
      selfChangedAt: access.selfChangedAt || null,
    },
    launchOfferUsedAt: user.launchOfferUsedAt || null,
    emailPrefs: {
      productUpdates: prefs.productUpdates !== false,
      stockAlerts: prefs.stockAlerts !== false,
      reminders: prefs.reminders !== false,
    },
    hasPendingPassword: Boolean(user.pendingCredential?.enc),
    createdBy: idString(user.createdBy),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null,
  };
}
