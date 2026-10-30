# Product Hub

Admin panel for managing products and preparing marketplace listings (Meesho first, more marketplaces can be added from the UI), plus a paid catalog for resellers: resellers buy a plan on the public site, then copy listing content and download images for the categories they have access to.

**Stack:** Next.js 16 (App Router, JavaScript only) · MongoDB (native driver) · Cloudinary (REST API via `fetch`) · Razorpay (REST API via `fetch`) · SMTP over `node:tls`. No other runtime dependencies.

## Setup

1. Install dependencies (Node.js 20.9+):
   ```bash
   npm install
   ```
2. Copy the environment template and fill it in:
   ```bash
   cp .env.example .env.local
   ```
   - `AUTH_SECRET`: at least 32 random characters, for example `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`. It also derives the keys for encrypted temporary passwords and preview tokens, so changing it makes pending temporary passwords unreadable.
   - `CLOUDINARY_*`: from the Cloudinary console (Dashboard → API Keys). These stay on the server.
   - `PAYMENT_MODE=mock` for local work. Use live Razorpay keys only in Vercel Production (see [Purchase flow](#purchase-flow)).
   - `SMTP_*`, `MAIL_*`, `NOTIFY_EMAIL`: see [Email](#email). Without them nothing is sent and mail stays queued.
   - `PUBLIC_BASE_URL`: the app's full URL, used for the login link in emails.
   - `CRON_SECRET`: see [Daily cron](#daily-cron).
3. Create the first Admin account. The command refuses to run if an admin already exists:
   ```bash
   npm run seed:admin
   ```
   Then remove `ADMIN_PASSWORD` from `.env.local`.
4. Run the app:
   ```bash
   npm run dev                 # development
   npm run build && npm start  # production
   ```
   `/` is the public home page; the admin panel starts at `/login`.

### Environment variables

| Name | Used for |
|---|---|
| `MONGODB_URI`, `MONGODB_DB_NAME` | Database (`product_hub`; tests use `product_hub_selftest`) |
| `AUTH_SECRET`, `SESSION_DAYS` | Sessions; key derivation for encrypted secrets and signed tokens |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER` | Product images |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` | AI screenshot reader and listing writer (optional) |
| `PAYMENT_MODE` | `razorpay` (default) or `mock` |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay orders, checkout signature, webhook signature |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` | Outgoing mail |
| `MAIL_FROM`, `MAIL_FROM_NAME` | Sender address and name (name defaults to `Product Hub`) |
| `NOTIFY_EMAIL` | Owner alerts; empty = alerts skipped |
| `MAIL_DAILY_LIMIT` | Emails per rolling 24 hours (default 200) |
| `CRON_SECRET` | Bearer token for `GET /api/cron/daily` |
| `PUBLIC_BASE_URL` | Links in emails |
| `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | `npm run seed:admin` only |
| `TEST_BASE_URL`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` | `scripts/test-authz.mjs` only |
| `VERCEL_ENV`, `NODE_ENV` | Set by the platform; `VERCEL_ENV=production` turns on the payment safety rules |

### How accounts are created

There is no public sign-up page and no registration endpoint. Accounts are created in only two ways:
- an Admin creates one with `POST /api/users` (User Management), optionally with free plan days and category access;
- a verified payment creates a reseller account for a new email (see [Purchase flow](#purchase-flow)).

## Tests

`scripts/test-authz.mjs` runs about 120 end-to-end checks against a running server: unauthenticated access, admin-only endpoints, sensitive-field stripping, mass assignment, inventory history, category field renames, CSRF, deactivation and password resets, reseller isolation (category scope, private trackers, shared listings admin-write only), the reseller tracker, the expired-plan `402` and logout. It cleans up the records it creates; stock movements and activity logs are kept because they are history. It does not yet cover checkout, coupons, payments, the webhook or the cron.

Always run it against the throwaway database, with mock payments:

```bash
export MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=product_hub_selftest PAYMENT_MODE=mock
npx next build
ADMIN_EMAIL=test-admin@example.com ADMIN_PASSWORD='a-test-password' node --env-file=.env.local scripts/seed-admin.mjs
npx next start -p 3123   # in another terminal, same environment
TEST_BASE_URL=http://localhost:3123 TEST_ADMIN_EMAIL=test-admin@example.com TEST_ADMIN_PASSWORD='a-test-password' npm run test:authz
```

Environment variables set in the shell override `.env.local`. Stop the server and drop `product_hub_selftest` afterwards.

## How it works

### Authentication
- Passwords are hashed with `crypto.scrypt` (random salt per user) and compared in constant time.
- Login creates a random 256-bit session token. Only an HMAC of it (keyed with `AUTH_SECRET`) is stored, in the `sessions` collection, which has a TTL index. The browser gets an `httpOnly`, `SameSite=Lax` cookie, which is also `Secure` in production.
- Every request loads the user from MongoDB again. Deactivating a user, resetting their password or changing their role takes effect on their next request, and their sessions are deleted.
- State-changing requests from another origin are rejected. Failed logins are throttled per email and per IP.
- A reseller whose plan has ended can still sign in, read `GET /api/auth/me`, change their password and sign out. Every other reseller API answers `402 { error, code: 'plan_expired' }`, and app pages redirect to `/renew`.

### Reseller subscription model

Resellers are users with the role `listing_user` (shown as "Reseller" in the UI). Plans are defined in `src/lib/plans.js`. There is no auto-renew: access ends at `users.planEndsAt`.

| Plan | Price | Days | Categories | Support |
|---|---|---|---|---|
| `m1` Starter Reseller | ₹299 | 30 | The reseller picks up to 2 | Chat |
| `m3` Pro Reseller | ₹499 | 90 | All | Chat and call |

- **Launch offer:** `m1` costs ₹99 for the first purchase per email **and** per phone, until 31 Dec 2026 23:59 IST (`LAUNCH_OFFER`). A payment that is paid but not yet fulfilled already counts as used, so two quick orders cannot both get it.
- **Buying again** while a paid plan is running adds the new days after the current end date. If the current time is free (comp) time or the plan has ended, the new plan starts from the purchase date (remaining free days are not added on top).
- **Coupons** (admin Coupons page, `src/lib/coupons.js`):
  - Kinds: `final_price` (pay exactly this many paise), `amount_off` (paise off) and `percent_off` (1-100). The price never goes below ₹1 (100 paise) or above the list price.
  - Each coupon has: the plans it applies to, `maxUses` (empty = unlimited), `maxUsesPerEmail` (default 1), optional `allowedEmails`, optional `expiresAt`, `isActive`, and optional `grants.categoryAccess` (`'all'` or a list of categories given on top of the plan).
  - Codes are 4-32 characters of `A-Z`, `0-9` and `-`, stored upper case.
  - A coupon and the launch offer never stack: the lower price wins (on a tie the coupon wins).
  - Every invalid case shows the same message, "Coupon not valid for this purchase".
  - A used coupon cannot be renamed or deleted; deactivate it instead.
  - If `maxUses` is reached while a buyer is already paying, the paid price is honoured, the redemption is flagged `overLimit` and the owner gets an email.
- **Category access** (`categoryScope(user)` in `src/lib/access.js`), checked in this order:
  1. Admin: all categories.
  2. `allAccessUntil` in the future (set by an `m3` purchase or an "all" coupon, up to the plan end): all.
  3. Admin set the reseller's access mode to "all": all.
  4. Otherwise the **union** of the categories the admin granted (`adminCategoryIds`, kept on any plan) and the categories the reseller picked (`selfCategoryIds`).
  - Self-picking works only while an `m1` plan is active and the reseller has no all-access; the limit is 2. Picks can be chosen at checkout or on the My Categories page.
  - Picks can be changed at most once every 7 days (`selfChangedAt`). The first pick has no wait.
  - Resellers on free (comp) time without a plan code, including migrated users, cannot self-pick; the admin grants their categories (migrated users get "all").
  - Products without a category are visible only to "all" scopes. New products must have a category; older products without one can still be edited.
  - Out-of-scope products answer `404`, the same as missing ones.
- **Expired plan:** the reseller can sign in but only sees `/renew`: a blurred grid of up to 24 product images from their scope (no names, prices or Cloudinary URLs reach the browser) and the plans to buy again. Images come from `GET /api/preview` (signed, 1-hour tokens) and `GET /api/preview/image/[token]`, which fetches a blurred 160 px thumbnail on the server.
- **Isolation:** resellers never see each other's work. Shared marketplace listings are read-only for resellers, within their scope, and their `notes`, `previousVersions` and `updatedByName` are removed. Each reseller has a private tracker (`resellerListings`) per product and portal (Meesho, Instagram, WhatsApp, Flipkart, Amazon, other) with a status, up to 50 notes and up to 10 saved AI versions.
- **Admin tools:** the admin Subscriptions page lists resellers with plan state, access, source, latest payment and any pending temporary password. From there or the API the admin can extend days, give free (comp) days, revoke time (`POST /api/users/[id]/plan`), set category access (`PUT /api/users/[id]/access`) and resend the welcome email (`POST /api/users/[id]/resend-welcome`). The Payments API (`/api/payments`) lists orders and records refunds.

### Purchase flow

Pages: `/` (plans), `/buy?plan=m1|m3`, `/buy/status?order=…`, plus the legal pages. All public checkout routes are rate-limited per IP and per email (hashed in `rateLimits`).

1. **Quote** (`POST /api/checkout/quote`): the server computes list price, launch offer and coupon. The client never sends a price.
2. **Order** (`POST /api/checkout/order`): name, email, 10-digit Indian mobile, plan, optional coupon and (for `m1`) up to 2 categories. A hidden `website` field is a bot trap. The price is computed again on the server, a provider order is created, and a `payments` record is stored with status `created`. Emails that belong to an admin or a deactivated account are refused. A signed-in reseller always buys for their own email.
3. **Payment:**
   - `PAYMENT_MODE=razorpay` (default): the browser opens Razorpay Checkout. Afterwards `POST /api/checkout/verify` checks the checkout signature, then fetches the payment from Razorpay and checks order id, amount and currency (capturing it if only authorised) before giving any access. A signed payment with a wrong amount or state is marked `needs_review` and the owner is emailed.
   - **Webhook** `POST /api/webhooks/razorpay`: authenticated by the HMAC of the raw body with `RAZORPAY_WEBHOOK_SECRET`. Handles `payment.captured`, `order.paid` (fulfil) and `payment.failed` (mark an unpaid order failed). Each event id is processed once (`webhookEvents`, kept 30 days); if processing fails the event id is forgotten so Razorpay's retry runs again. A second captured payment on the same order is marked `needs_review`. Configure the webhook in the Razorpay Dashboard with the URL `https://<app domain>/api/webhooks/razorpay`.
   - `PAYMENT_MODE=mock` (local and preview testing): no Razorpay call is made; the order id is `mock_<random>`. It is finished either from the TEST MODE panel on `/buy/status` (`POST /api/checkout/mock-complete`, paid or failed) or by the admin marking the payment paid (`PATCH /api/payments/[id]` with `{ markPaid: true }`). Both run the same fulfilment.
   - **Safety rules:** `PAYMENT_MODE=mock` is refused when `VERCEL_ENV=production`, and `rzp_live_` keys are refused whenever `VERCEL_ENV` is not `production`. Keep live keys only in Vercel's Production environment.
4. **Fulfilment** (`fulfilPayment()` in `src/lib/subscriptions.js`) is repeat-safe: verify, webhook, the mock panel, "mark paid" and the cron may all call it for the same payment and the result is the same as one call. It:
   - moves the payment to `paid` (only one caller wins);
   - finds the buyer by email or creates a new reseller with a random 10-character temporary password (only the run that inserts the user gets one). **Paying again with an existing email never resets the password.** If the email belongs to an admin or a deactivated account, the payment goes to `needs_review`;
   - writes one `subscriptions` record per payment, extends the plan once per payment, applies all-access (`m3` or an "all" coupon), coupon category grants and the `m1` category picks;
   - records the coupon use and the launch-offer use;
   - queues the emails: `welcome` (with the temporary password) for a new account, otherwise `receipt`, plus `owner_new_purchase` to `NOTIFY_EMAIL`. Each is deduplicated per payment;
   - marks the payment `fulfilled`.
5. **Status** (`GET /api/checkout/status?order=`): `pending`, `fulfilled` or `failed`, with a masked email.

Payment statuses: `created`, `paid`, `fulfilled`, `failed`, `abandoned` (unpaid for 24 hours), `refunded`, `needs_review`. Refunds are made in the Razorpay Dashboard; the admin then records them with `PATCH /api/payments/[id]` (`refundNote`, optional `revokeDays` to remove plan days).

**Temporary password:** stored AES-256-GCM encrypted in `users.pendingCredential` (key derived from `AUTH_SECRET`). The admin can read it on the Subscriptions page until the reseller changes their password (`POST /api/auth/password` removes it) or the admin sets a password by hand. "Resend welcome" makes a new temporary password, signs the reseller out everywhere and queues a new welcome email.

### Email

- `src/lib/mailer.js` is a small SMTP client on `node:tls` (no mail library). Production uses GoDaddy: `smtpout.secureserver.net`, port 465 with TLS. Port 587 with STARTTLS also works; login is never sent without TLS. Mail comes from `MAIL_FROM` with the name `MAIL_FROM_NAME` (default "Product Hub"). Owner alerts go to `NOTIFY_EMAIL`.
- Requests never wait for SMTP. Every email is put in the `emailOutbox` queue (`src/lib/outbox.js`) and sent in small batches, either right after a purchase or resend (`after()`, up to 5 messages) or by the daily cron.
- Order: transactional mail first (welcome, receipt), then owner alerts, then updates.
- `MAIL_DAILY_LIMIT` (default 200) caps the messages sent in any 24 hours; the rest wait for the next run.
- Failed sends are retried up to 5 times (after 5 minutes, 30 minutes, 2 hours and 12 hours). Bad addresses or broken messages fail at once. While SMTP is not configured, nothing is sent and the queue is kept.
- A temporary password travels only inside the queue record, encrypted, and is deleted from it once the mail is sent or fails. If a welcome mail fails, use "Resend welcome".
- Templates (`src/lib/emailTemplates.js`): `welcome`, `receipt`, `owner_new_purchase`, `owner_needs_review`, `owner_coupon_over_limit`.
- Logs show only the template and status, never the address, body or password.

### Daily cron

`GET /api/cron/daily` with the header `Authorization: Bearer <CRON_SECRET>` (anything else gets `401`). Each run:
1. finishes up to 25 payments that are `paid` but not `fulfilled` (for example after a timeout);
2. marks orders still `created` after 24 hours as `abandoned`;
3. sends queued email for about 40 seconds.

It returns a JSON summary. Vercel Cron sends the `CRON_SECRET` header automatically when the variable is set, but the schedule must be added to `vercel.json` (`"crons": [{ "path": "/api/cron/daily", "schedule": "…" }]`); it is not there yet. To run it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<app domain>/api/cron/daily
```

### Migrating existing listing users

`scripts/migrate-resellers.mjs` turns every existing `listing_user` without a plan into a reseller on free (comp) time with access to all categories. It also copies a shared Meesho listing into that user's private tracker only when the user worked on it (changed its status or wrote notes). It is a dry run unless `--apply` is given, never writes to shared listings or history, and is safe to run again.

```bash
# 1. Dry run: prints what would change, writes nothing
node --env-file=.env.local scripts/migrate-resellers.mjs --comp-until=2026-12-31

# 2. Apply (owner approval needed for product_hub): backs up the affected collections first
node --env-file=.env.local scripts/migrate-resellers.mjs --apply --comp-until=2026-12-31 --backup-dir=/path/outside/the/repo
```

- `--comp-until=YYYY-MM-DD`: free access ends that day at 23:59:59 IST; must be in the future. Required with `--apply`.
- `--backup-dir=<dir>`: required with `--apply` (except on `product_hub_selftest`). The affected collections are exported there as Extended JSON before any write.
- `MONGODB_DB_NAME` must be set explicitly; the script refuses `meesho-admin`.

### Role permissions (enforced in every route handler)

| | Admin | Active reseller | Expired reseller |
|---|---|---|---|
| Sign in, own account, change password, sign out | ✔ | ✔ | ✔ |
| Products: view | All, including costs, profit, stock and supplier | Active products in their category scope only. Costs, profit, exact stock, supplier and internal notes are removed on the server | ✖ 402 (blurred preview on `/renew` only) |
| Products, categories, fields, images: change | ✔ | ✖ 403 | ✖ |
| Image download / ZIP | ✔ | ✔ (in scope) | ✖ |
| Shared marketplace listings | Create, edit, delete, status, notes | View and copy (in scope); no notes or history | ✖ 402 |
| AI new version: generate | ✔ (no daily cap) | ✔ 5 per India day | ✖ 402 |
| AI new version: save | Into the shared listing | Into their own tracker only | ✖ 402 |
| Own tracker (My Listings: status, notes, saved versions) | – | ✔ | ✖ 402 |
| Own category picks (My Categories) | – | ✔ `m1` only, limit 2, once per 7 days | ✖ 402 |
| Inventory, pricing, users, marketplaces | ✔ | ✖ 403 | ✖ |
| Coupons, subscriptions, payments, plan and access changes | ✔ | ✖ 403 | ✖ 403 |

Admin-only routes return `403` to resellers whether or not their plan is active.

### Collections
- `users`: name, email (unique), `phone`, role, `passwordHash`, `isActive`, `mustChangePassword`, `lastLoginAt`, `source` (`admin`, `purchase`, `migration`); plan fields `planCode`, `planStartedAt`, `planEndsAt`, `planSource` (`paid`, `comp`), `planPaymentIds`, `allAccessUntil`; `categoryAccess` (`adminMode`, `adminCategoryIds`, `selfCategoryIds`, `selfChangedAt`); `launchOfferUsedAt`; `pendingCredential` (encrypted temporary password); `emailPrefs`
- `sessions`: `tokenHash`, `userId`, `expiresAt` (TTL)
- `categories`: name, slug, `isActive`, `fields[]` (`id`, `key`, `label`, `type`, `options`, `required`, `order`, `helpText`)
- `products`: core fields, `categoryId`, costs, `stock`, `lowStockThreshold`, `customFields{key: value}`, `images[]` (Cloudinary `publicId`, `url`, `label`; the first image is the main image)
- `marketplaceListings`: shared, admin-written. `productId` + `marketplace` (unique together), title, description, style ID, marketplace SKU, keywords, attributes, highlights, pack quantity, suggested price, status, `notes[]`, `previousVersions[]`
- `resellerListings`: each reseller's private tracker. `userId` + `productId` + `portal` (unique together), `portalLabel`, status (`not_started`, `in_progress`, `listed`, `needs_changes`, `paused`), `notes[]` (max 50), `savedVersions[]` (max 10)
- `marketplaces`: key and name (Meesho is created automatically)
- `coupons`: `code` (unique), `kind`, `value`, `plans`, `maxUses`, `usedCount`, `maxUsesPerEmail`, `allowedEmails`, `expiresAt`, `isActive`, `grants.categoryAccess`, `note`
- `couponRedemptions`: one per paid order using a coupon (`paymentId` unique), with `email`, `amountPaise`, `overLimit`
- `payments`: provider (`razorpay`, `mock`), `providerOrderId` (unique), `providerPaymentId`, `planCode`, `price` (`listPaise`, `offerApplied`, `couponDiscountPaise`, `finalPaise`), coupon, customer (name, email, phone), requested categories, status, `refund`, `review`, `events[]` (last 20), `ipHash`
- `subscriptions`: history of plan time per user (`source`: `razorpay`, `mock`, `comp`, `migration`, `manual`), with days, amount, start and end; one per payment
- `webhookEvents`: processed Razorpay event ids (TTL 30 days)
- `rateLimits`: hashed rate-limit keys and the reseller AI-generation counters (TTL)
- `emailOutbox`: queued emails (`to`, template, data, encrypted `secret`, priority, status, attempts, `dedupeKey`)
- `stockMovements`: append-only history (type, change, before and after, reason, user)
- `activityLogs`: important admin and reseller actions

Stock changes only through stock movements. Product edits cannot overwrite it. Renaming a category field's key moves the stored product values to the new key.

### Fill a product from a screenshot
On **Add Product**, the admin can upload or paste (Ctrl+V) a screenshot of a marketplace form, such as Meesho's "Add Catalog" page. The browser cuts tall screenshots into overlapping slices so small text stays readable, and the admin-only route `POST /api/products/extract` sends the slices to an AI vision model with structured JSON output. It uses Google Gemini when `GEMINI_API_KEY` is set (`gemini-3.5-flash`, falling back to `gemini-flash-latest` when busy), otherwise Claude (`claude-opus-5-5`) when `ANTHROPIC_API_KEY` is set. The model returns:
- every label/value pair it sees, in on-screen order;
- the best-matching category, filled with that category's fields;
- values mapped onto the core product fields.

The form is filled and the filled fields are highlighted, but nothing is saved. The label/value pairs become an editable "Meesho listing" draft, which is saved as the product's Meesho listing only when the admin creates the product. Without either key the screenshot box is hidden and products are added by hand as usual.

### New title, description, style ID & SKU (AI)
`POST /api/products/:id/listing-version` generates a new title, description, style ID and marketplace SKU for one product. The AI (same provider as the screenshot reader) uses only this product's saved details, its current listing and up to 4 of its photos, and is told which style IDs and SKUs were already used so they are not repeated. Nothing is saved by generating.

`PUT /api/products/:id/listing-version` saves a version, and accepts only those four fields:
- **Admin:** into the shared Meesho listing; the replaced values move to *Previous versions* (last 20 kept). The product's internal SKU is never changed, because stock history and image file names depend on it.
- **Reseller:** into their own tracker for a portal (`portal` in the body, default `meesho`), last 10 kept. The shared listing is never changed.

Resellers can generate 5 versions per India calendar day (counted in MongoDB; a failed AI call does not use one up).

### Images
Image files never pass through the app server, so hosting request and response size limits (for example 4.5 MB on Vercel) don't apply:
- **Upload:** the admin's browser asks `POST /api/products/:id/images/sign` for a signature. The signature only allows image formats, only this product's folder, and expires after about 1 hour; the API secret stays on the server. The browser uploads the file directly to Cloudinary, with a progress bar. The server then looks up the `publicId` through Cloudinary's Admin API, checks it is in that product's folder, and stores the metadata Cloudinary returns.
- **Download / ZIP:** the browser fetches the images from Cloudinary (which allows this via CORS) and builds the ZIP locally with `src/lib/zip.js`, a small dependency-free ZIP writer.

MongoDB stores only image metadata (`publicId`, URL, label, order).
