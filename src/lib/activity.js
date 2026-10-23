import { getDb } from './db';

// Records an important action. Failures are logged but never block the request.
export async function logActivity(user, action, { entityType, entityId, summary, details } = {}) {
  try {
    const db = await getDb();
    await db.collection('activityLogs').insertOne({
      action,
      entityType: entityType || null,
      entityId: entityId || null,
      summary: summary || action,
      details: details || null,
      userId: user?._id || null,
      userName: user?.name || 'System',
      userRole: user?.role || null,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('[activity] failed to log', action, err);
  }
}
