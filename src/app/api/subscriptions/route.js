import { getDb } from '@/lib/db';
import { json, route } from '@/lib/api';
import { requireAdmin } from '@/lib/auth';
import { ROLES } from '@/lib/constants';
import { categoryScope, planState } from '@/lib/access';
import { decryptSecret } from '@/lib/tokens';
import { CREDENTIAL_INFO } from '@/lib/subscriptions';
import { serializePayment } from '@/lib/payments';
import { serializeUser } from '@/lib/users';

// Admin: every reseller with plan state, access summary, latest payment and any
// temporary password that has not been replaced by the reseller yet.
export const GET = route(async () => {
  await requireAdmin();
  const db = await getDb();
  const [users, categories, latest] = await Promise.all([
    db.collection('users').find({ role: ROLES.LISTING_USER }, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(1000).toArray(),
    db.collection('categories').find({}, { projection: { name: 1 } }).toArray(),
    db
      .collection('payments')
      .aggregate([
        { $match: { userId: { $ne: null } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: '$userId', payment: { $first: '$$ROOT' } } },
      ])
      .toArray(),
  ]);
  const names = new Map(categories.map((c) => [c._id.toString(), c.name]));
  const paymentByUser = new Map(latest.map((row) => [row._id.toString(), row.payment]));
  const now = new Date();

  const resellers = users.map((user) => {
    const scope = categoryScope(user, now);
    const access = user.categoryAccess || {};
    const adminIds = new Set((access.adminCategoryIds || []).map(String));
    const payment = paymentByUser.get(user._id.toString());
    return {
      ...serializeUser(user),
      plan: planState(user, now),
      access: {
        all: scope.all,
        adminMode: access.adminMode === 'all' ? 'all' : 'selected',
        categories: scope.all
          ? []
          : scope.categoryIds.map((id) => ({
              id: id.toString(),
              name: names.get(id.toString()) || 'Deleted category',
              via: adminIds.has(id.toString()) ? 'admin' : 'self',
            })),
      },
      pendingPassword: user.pendingCredential?.enc ? decryptSecret(user.pendingCredential.enc, CREDENTIAL_INFO) : null,
      pendingPasswordCreatedAt: user.pendingCredential?.createdAt || null,
      latestPayment: payment ? serializePayment(payment) : null,
    };
  });
  return json({ resellers });
});
