import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const unauthorized = (msg = 'Authentication required') => new ApiError(401, msg);
export const forbidden = (msg = 'You do not have permission to perform this action') => new ApiError(403, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const conflict = (msg) => new ApiError(409, msg);

export function json(data, init = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers || {}) },
  });
}

// Rejects cross-site state-changing requests (CSRF defence in addition to SameSite cookies).
function assertSameOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if (!origin) return; // non-browser clients (no ambient cookies from other sites)
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden('Invalid request origin');
  }
  if (originHost !== host) throw forbidden('Cross-site request blocked');
}

// Wraps a route handler with origin checks and uniform error handling.
export function route(handler) {
  return async (request, context) => {
    try {
      assertSameOrigin(request);
      const params = context?.params ? await context.params : {};
      return await handler(request, params);
    } catch (err) {
      if (err instanceof ApiError) {
        return json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err?.code === 11000) {
        return json({ error: 'A record with the same unique value already exists' }, { status: 409 });
      }
      console.error('[api]', request.method, request.nextUrl?.pathname, err);
      return json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  };
}

export async function readJson(request) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw badRequest('Expected a JSON request body');
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
    return body;
  } catch {
    throw badRequest('Invalid JSON body');
  }
}
