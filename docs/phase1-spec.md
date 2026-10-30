# Phase 1 spec: reseller subscriptions

This is the single source of truth for all agents working on Phase 1. Follow `CLAUDE.md`. Each agent edits **only the files it owns** (listed in the ownership table at the end). If a change is needed in a file owned by someone else, ask the main conversation for it instead of making it.

## Business rules

- **Resellers** keep the existing role `listing_user`. The UI calls them "Reseller".
- **Plans**: no auto-renew; access ends at `planEndsAt`.
  - `m1`: ₹299 for 30 days, tier `limited`. The reseller picks up to **2** categories. Support: chat.
  - `m3`: ₹499 for 90 days, tier `all`. All categories. Support: chat and call.
  - **Launch offer**: `m1` costs ₹99 (9900 paise) for the first purchase per email **and** per phone. It runs until `LAUNCH_OFFER.until` (2026-12-31 23:59 IST).
- **Coupons** (admin-made):
  - `final_price`, `amount_off` or `percent_off`. The final price is never below 100 paise.
  - Each coupon applies to a list of plans and has `maxUses`, `maxUsesPerEmail`, optional `allowedEmails`, `expiresAt`, `isActive`, and optional `grants.categoryAccess` (`null` | `'all'` | `[categoryId]`).
  - A coupon and the launch offer do not stack: the lower price wins. The coupon field shows the same message, "Coupon not valid for this purchase", for every invalid case.
- **Category access**: computed by `categoryScope(user)` in `src/lib/access.js`. The rules are applied in this order:
  1. `admin`: all.
  2. `allAccessUntil > now`, which is set by an `m3` purchase or an "all" coupon: all.
  3. `categoryAccess.adminMode === 'all'`: all.
  4. Otherwise, the **union** of `categoryAccess.adminCategoryIds` (anything the admin grants, any plan) and `categoryAccess.selfCategoryIds` (picked by the reseller).
  - `selfCategoryIds.length` must stay at or below `selfLimit(user)`. That limit is 2 while the active plan is `m1`. While `m3` (all access) is active, self-picking does nothing.
  - The reseller can change their own picks at most once every 7 days (`categoryAccess.selfChangedAt`). The first pick has no wait.
  - Products without a category are visible only to `all` scopes.
- **Expired plan**: login works.
  - `/renew` shows a blurred catalog (no names, prices or Cloudinary URLs) plus the plans.
  - Every other reseller API returns `402 { error, details: { code: 'plan_expired' } }`, and the client sends the browser to `/renew`.
- **Isolation**: resellers never see each other's work.
  - Shared `marketplaceListings` are admin-write only; resellers read them only within their scope.
  - `serializeListing` removes `notes`, `previousVersions` and `updatedByName` for non-admins.
  - Each reseller has a private tracker in `resellerListings`.
- **Temporary password**: generated only when payment fulfilment creates a **new** user, or on an admin resend.
  - It is stored AES-256-GCM encrypted in `users.pendingCredential` until the user changes their password; `POST /api/auth/password` clears it.
  - The admin can read it on the Subscriptions page.
  - Paying again with an existing email **never** resets its password.
- **Payments**:
  - `PAYMENT_MODE=razorpay` (the default) or `PAYMENT_MODE=mock`.
  - Mock mode is refused when `VERCEL_ENV === 'production'`. In mock mode no Razorpay call is made: the order is created as `mock_<random>` with status `created`. It is then finished either by the `/buy/status` test panel (`POST /api/checkout/mock-complete`) or by the admin's "Mark paid (test)" button, and both run the same `fulfilPayment()`.
  - Razorpay calls are refused when the key starts with `rzp_live_` and `VERCEL_ENV !== 'production'`.
- **Products**: creating a product requires `categoryId`. Updating an existing product without a category is still allowed; the owner will fix those later.
- **Email** goes through GoDaddy SMTP (`smtpout.secureserver.net:465`, TLS), from `MAIL_FROM` with the name `MAIL_FROM_NAME=Product Hub`. Owner alerts go to `NOTIFY_EMAIL`.
- Branding on the public site: "Product Hub" (by CaseStores). The support email is contact@casestores.in.

## Environment variables

| Name | Notes |
|---|---|
| `PAYMENT_MODE` | `razorpay` or `mock` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | |
| `MAIL_FROM`, `MAIL_FROM_NAME`, `NOTIFY_EMAIL` | |
| `MAIL_DAILY_LIMIT` | Default 200 |
| `CRON_SECRET` | |
| `PUBLIC_BASE_URL` | For example `https://<app domain>`. Used in email links. |
| `AUTH_SECRET` | Existing. The encryption and HMAC keys are derived from it with HKDF and these `info` values: `'pending-credential'`, `'preview-token'`, `'unsubscribe'`. |

## Data model

**`users`: new fields**
- `phone: string|null`
- `planEndsAt: Date|null`, `planStartedAt: Date|null`, `planCode: 'm1'|'m3'|null`, `planSource: 'paid'|'comp'|null`
- `allAccessUntil: Date|null`
- `categoryAccess: { adminMode: 'all'|'selected', adminCategoryIds: ObjectId[], selfCategoryIds: ObjectId[], selfChangedAt: Date|null, updatedAt }`
- `launchOfferUsedAt: Date|null`
- `pendingCredential: { enc: string, createdAt: Date } | null`
- `emailPrefs: { productUpdates: true, stockAlerts: true, reminders: true }`
- `source: 'admin'|'purchase'|'migration'`

**`coupons`**
- `code` (unique, upper case)
- `kind`, `value`, `plans`
- `maxUses`, `usedCount`, `maxUsesPerEmail` (default 1), `allowedEmails`
- `expiresAt`, `isActive`
- `grants: { categoryAccess: null|'all'|ObjectId[] }`
- `note`, `createdBy`, `createdAt`, `updatedAt`

**`couponRedemptions`**
- `couponId`, `paymentId` (unique), `email`, `userId`, `amountPaise`, `overLimit`, `createdAt`

**`payments`**
- `provider: 'razorpay'|'mock'`
- `providerOrderId` (unique), `providerPaymentId` (unique, partial index)
- `planCode`
- `price: { listPaise, offerApplied, couponDiscountPaise, finalPaise }`
- `couponId`, `couponCode`
- `customer: { name, email, phone }`, `requestedCategoryIds`
- `buyerUserId`, `userId`
- `status: created|paid|fulfilled|failed|abandoned|refunded|needs_review`
- `paidAt`, `fulfilledAt`, `failure`, `refund`
- `events[]` (capped at 20), `ipHash`, `createdAt`, `updatedAt`

**`subscriptions`**
- `userId`, `planCode`, `tier`, `days`, `amountPaise`, `startsAt`, `endsAt`
- `paymentId` (unique, partial index), `couponId`
- `source: razorpay|mock|comp|migration|manual`
- `createdBy`, `note`, `createdAt`

**`resellerListings`**
- `userId`, `productId`
- `portal: meesho|instagram|whatsapp|flipkart|amazon|other`, `portalLabel`
- `status: not_started|in_progress|listed|needs_changes|paused`
- `notes[]` (max 50, each `{ id, text, createdAt }`)
- `savedVersions[]` (max 10, each `{ title, description, styleId, sku, savedAt }`)
- `createdAt`, `updatedAt`
- Unique on (`userId`, `productId`, `portal`).

**`webhookEvents`**: `eventId` (unique), `type`, `receivedAt` (TTL 30 days).

**`rateLimits`**: `key` (unique), `count`, `expiresAt` (TTL).

**`emailOutbox`**
- `to`, `userId`, `template`, `data`
- `secret` (encrypted temporary password, removed once sent)
- `priority` (0 = transactional, 1 = owner, 2 = updates)
- `status: queued|sending|sent|failed|cancelled`
- `attempts`, `lastError`, `sendAfter`, `lockedUntil`, `sentAt`
- `dedupeKey` (unique, partial index), `createdAt`

## Shared library contracts

These are the functions other modules can call.

- **`src/lib/plans.js`**
  - `PLANS`, `LAUNCH_OFFER`, `MIN_PAISE = 100`
  - `getPlan(code)`
  - `selfLimitForPlan(code)`: `m1` = 2, `m3` = 0 (all)
- **`src/lib/access.js`**
  - `categoryScope(user)` returns `{ all: true }` or `{ all: false, categoryIds: ObjectId[] }`.
  - `productScopeMatch(user)` returns a Mongo filter (`{}` when all, otherwise `{ categoryId: { $in: ids } }`), to be combined with `$and`.
  - `assertProductInScope(product, user)` throws 404.
  - `isCategoryInScope(categoryId, user)`
  - `planState(user)` returns `{ active, endsAt, planCode, tier, daysLeft }`.
  - `selfLimit(user)`
  - `resellersWithAccessTo(categoryId)`
- **`src/lib/auth.js`** (changed)
  - `requireUser({ allowExpired = false } = {})` and `requirePageUser({ allowExpired })`: for `listing_user` without an active plan, the API version throws `ApiError(402, 'Your plan has ended', { code: 'plan_expired' })` and the page version redirects to `/renew`.
  - `requireAdmin()` is unchanged.
  - `publicUser(user)` adds `plan: planState(user)` and `access: { all, categoryCount }`.
- **`src/lib/tokens.js`**
  - `encryptSecret(text, info)` and `decryptSecret(enc, info)` (AES-256-GCM)
  - `signToken(payload, info, ttlSec)` and `verifyToken(token, info)`
- **`src/lib/rateLimit.js`**: `hit(key, limit, windowSec)` throws `ApiError(429)`.
- **`src/lib/payments.js`**
  - `paymentMode()`
  - `createProviderOrder({ amountPaise, receipt, notes })` returns `{ provider, providerOrderId, keyId? }`.
  - `verifyCheckoutSignature(...)`, `fetchProviderPayment(id)`, `verifyWebhookSignature(rawBody, signature)`
- **`src/lib/coupons.js`**
  - `normalizeCode(code)`
  - `quote({ planCode, email, phone, couponCode })` returns `{ listPaise, finalPaise, offerApplied, coupon|null }`.
  - `redeem(payment)`
- **`src/lib/subscriptions.js`**
  - `fulfilPayment(paymentId)`: safe to run more than once.
  - `extendPlan(userId, { days, planCode, source, ... })`
  - `compUser(userId, days, note, adminId)`
  - `revokeUser(...)`
- **`src/lib/mailer.js`**: `sendMail({ to, subject, html, text, headers })`
- **`src/lib/outbox.js`**: `enqueue({ to, userId, template, data, secret, priority, dedupeKey, sendAfter })` and `drain({ budgetMs, max })`.
- **`src/lib/emailTemplates.js`**: `render(template, data)` returns `{ subject, html, text }`. Templates:
  - `welcome`: login URL, email, temporary password, plan, end date, access summary
  - `receipt`: plan extended
  - `owner_new_purchase`
  - `owner_needs_review`
  - `owner_coupon_over_limit`

## API contract

All routes use `route()`. Admin routes use `requireAdmin()`.

### Public routes (no login; rate-limited)

- **`GET /api/plans`**: plan list for the home page, from `PLANS` (`code`, `name`, `days`, `paise`, `tier`, `categoryLimit`, `features`), plus `LAUNCH_OFFER`.
- **`GET /api/checkout/categories`**: `[{ id, name, productCount }]` for active categories.
- **`POST /api/checkout/quote`**
  - Body: `{ planCode, email, phone, couponCode? }`
  - Returns: `{ listPaise, finalPaise, offerApplied, couponApplied, couponError?, pickCategories: { enabled, max } }`
- **`POST /api/checkout/order`**
  - Body: `{ name, email, phone, planCode, couponCode?, categoryIds?, website }`. `website` is a honeypot field.
  - Returns: `{ provider, orderId, amountPaise, keyId?, prefill, statusUrl }`
- **`POST /api/checkout/verify`**: Razorpay only.
  - Body: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`
  - Returns: `{ status, maskedEmail, newAccount }`
- **`POST /api/checkout/mock-complete`**: mock mode only.
  - Body: `{ orderId, outcome: 'paid'|'failed' }`
  - Returns the same shape as verify.
- **`GET /api/checkout/status?order=`**: `{ status: 'pending'|'fulfilled'|'failed', maskedEmail? }`
- **`POST /api/webhooks/razorpay`**: raw body plus signature. Handles `payment.captured`, `order.paid` and `payment.failed`.

### Signed-in routes (`allowExpired`)

- `GET /api/auth/me`, `POST /api/auth/logout`, `POST /api/auth/password` (also clears `pendingCredential`)
- **`GET /api/preview`**: returns `{ total, cards: [{ token }] }`, with at most 24 cards, within the reseller's scope.
- **`GET /api/preview/image/[token]`**: blurred JPEG bytes (`c_fill,w_160,h_160,e_blur:2000,q_auto:low,f_jpg`), fetched on the server.

### Reseller routes (active plan required)

- Existing product, category and listing reads are filtered by scope.
- **`GET /api/my-categories`**: `{ limit, selfCategoryIds, adminCategoryIds, adminMode, all, canChangeAt, categories: [{ id, name, productCount }] }`
- **`PUT /api/my-categories`**
  - Body: `{ categoryIds }`
  - Enforces the limit and the 7-day change rule.
- **`GET /api/my-listings?status=&portal=&q=`**
- **`PUT /api/my-listings/[productId]`**
  - Body: `{ portal, status }`
  - Creates the record if missing.
- **`POST /api/my-listings/[productId]/notes`**
  - Body: `{ portal, text }`
- **`DELETE /api/my-listings/[productId]?portal=`**
- **`POST /api/products/[id]/listing-version`**: generates a version. Capped at 5 per day for resellers (counted in Mongo).
- **`PUT /api/products/[id]/listing-version`**
  - Resellers: saves into their own `resellerListings.savedVersions`, using `portal` from the body (default `meesho`).
  - Admin: saves into the shared listing, as today.
- **`PATCH /api/listings/:id`** and **`POST /api/listings/:id/notes`**: admin only from now on.

### Admin routes

- **Coupons**
  - `GET /api/coupons`
  - `POST /api/coupons`
  - `PATCH /api/coupons/[id]`
  - `DELETE /api/coupons/[id]`: only when `usedCount === 0`.
- **`GET /api/subscriptions`**: resellers with `planState`, access summary, `source`, and `pendingPassword`. The temporary password is decrypted, and only returned while `pendingCredential` exists.
- **`POST /api/users/[id]/plan`**: `{ action: 'extend'|'comp'|'revoke', days, note }`
- **`PUT /api/users/[id]/access`**: `{ adminMode: 'all'|'selected', adminCategoryIds }`
- **Payments**
  - `GET /api/payments?status=`
  - `PATCH /api/payments/[id]`: `{ refundNote, revokeDays? }`, or `{ markPaid: true }`. `markPaid` works in mock mode only.
- **`POST /api/users/[id]/resend-welcome`**: makes a new temporary password, stores `pendingCredential`, and queues the welcome email.
- **`POST /api/users`** and **`PATCH /api/users/[id]`**: accept `phone`, `compDays`, `adminMode` and `adminCategoryIds`.

### Cron

- **`GET /api/cron/daily`** with `Authorization: Bearer CRON_SECRET`. It:
  - re-runs fulfilment for payments that are paid but not fulfilled;
  - marks orders as abandoned after 24 hours;
  - drains the outbox for about 45 seconds.

## Pages

- **Public** (`src/app/(public)/`): `/` (home), `/terms`, `/privacy`, `/refund-policy`, `/shipping-policy`, `/contact`, `/buy?plan=m1|m3`, `/buy/status?order=`.
- **`/renew`**: outside `(app)`, uses `allowExpired`.
- **App** (`src/app/(app)/`):
  - `/subscriptions` and `/coupons` (admin)
  - `/my-listings` and `/my-categories` (reseller)
- **Product form**: the category is required on create, with a "+ New category" popup that calls `POST /api/categories` and selects the new category.

## File ownership (Phase 1, wave 1)

| Agent | Owns |
|---|---|
| database-admin | `src/lib/db.js` (indexes only), `scripts/migrate-resellers.mjs` |
| backend-dev (commerce) | `src/lib/plans.js`, `payments.js`, `coupons.js`, `subscriptions.js`, `tokens.js`, `rateLimit.js`, `users.js`; `src/app/api/plans`, `checkout/*`, `webhooks/*`, `cron/*`, `coupons/*`, `subscriptions/*`, `payments/*`, `users/*` |
| backend-dev (access) | `src/lib/access.js`, `auth.js`, `products.js`, `listings.js`, `listingWriter.js`; `src/app/api/products/**`, `listings/**`, `categories/**`, `dashboard`, `my-listings/**`, `my-categories`, `preview/**`, `auth/**` |
| email-manager | `src/lib/mailer.js`, `outbox.js`, `emailTemplates.js` |
| frontend-dev (public) | `src/app/(public)/**`, `src/app/renew/**`, `src/app/page.js` (removed and moved into `(public)`), `src/app/layout.js` (robots), `src/lib/site.js`, plus a public section appended at the **end** of `globals.css`, between the markers `/* ==== public site ==== */` and `/* ==== end public site ==== */` |

Wave 2 (after wave 1) is the app UI, owned by frontend-dev: AppShell, the subscriptions, coupons, my-listings and my-categories pages, the users access editor, the product form category popup, and the reseller view of `ListingPanel`. It is followed by docs-writer, code-reviewer, security-auditor and qa-tester.

During wave 1, do **not** run `npx next build`: other agents are editing the same tree at the same time. Use `node --check` on plain `.js` library files. The main conversation runs the build after the wave.
