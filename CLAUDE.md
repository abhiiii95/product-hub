# Product Hub: rules for every agent

Admin panel for products and Meesho listings. Two roles: `admin` (owner) and `listing_user`, shown as "Reseller": a paid subscriber who copies listing content and downloads images for the categories they can access.

## Stack (hard rules)
- Next.js 16 App Router, **JavaScript only**: no `.ts`/`.tsx`, no TypeScript.
- **No new npm packages.** Only `next`, `react`, `react-dom` and `mongodb` are allowed. Use the native MongoDB driver, built-in `fetch`, `node:crypto` and plain CSS (`src/app/globals.css`).
- Next 16 has breaking changes: read `node_modules/next/dist/docs/` before using an API you are unsure of (`params` and `cookies()` are async, middleware is called `proxy`).
- Read `AGENTS.md` too.

## Where things live
- `src/lib/`: server logic. `db.js` (Mongo + indexes), `auth.js` (sessions, `requireUser`/`requireAdmin`), `api.js` (`route()` wrapper, `ApiError`), `validate.js`, `products.js` (role-aware `serializeProduct`), `listings.js`, `categories.js`, `cloudinary.js`, `ai.js` (Gemini/Claude JSON client), `extract.js` (screenshot reader), `listingWriter.js` (AI title/description), `zip.js`, `pricing.js`.
- `src/app/api/**/route.js`: route handlers. Every handler is wrapped in `route()` and starts with `requireUser()` or `requireAdmin()`.
- `src/lib/` (reseller subscriptions): `plans.js`, `access.js` (category scope, plan state), `payments.js` (Razorpay/mock), `coupons.js`, `subscriptions.js` (`fulfilPayment`, comp/extend/revoke), `tokens.js` (AES-GCM, signed tokens), `rateLimit.js`, `mailer.js` (SMTP), `outbox.js` (email queue), `emailTemplates.js`, `site.js`.
- `src/app/(app)/**`: pages. Admin-only pages call `requirePageAdmin()`.
- `src/app/(public)/**`: public home, legal pages, `/buy`, `/buy/status`. `src/app/renew`: blurred catalog for expired resellers.
- API groups: public `plans`, `checkout/*`, `webhooks/razorpay`, `cron/daily` (scheduled in `vercel.json`); reseller `my-listings/**`, `my-categories`, `preview/**`; admin `coupons/**`, `subscriptions`, `payments/**`, `users/[id]/{plan,access,resend-welcome}`.
- `scripts/migrate-resellers.mjs`: dry run by default; `--apply --comp-until=YYYY-MM-DD --backup-dir=...` (owner approval needed for real data).
- Specs and status: `docs/phase1-spec.md`, `docs/phase1-progress.md`.
- `src/components/`: shared client components.
- `scripts/seed-admin.mjs`, `scripts/test-authz.mjs` (about 100 end-to-end authorization checks).
- `scripts/business-snapshot.mjs` (`npm run business:snapshot`): read-only JSON summary of products, margins, stock and listings for the business-advisor agent.
- `business/` (git-ignored): the owner's private business profile and decision journal. Never commit it.

## Security rules (never break)
- Resellers (`listing_user`) need an active plan; without one every API except `auth/*` and `preview/*` returns 402.
- Resellers see only active products in their category scope (`categoryScope` in `access.js`) and never receive costs, profit, margin, supplier, internal notes or exact stock. Enforce this in the serializer and the route, not only in the UI.
- Whitelist the fields each role may write (no mass assignment). Resellers write only their own tracker (`resellerListings`), their own category picks, and AI versions saved into their tracker; shared `marketplaceListings` are admin-write only.
- Accounts are created only by an admin or by a verified payment: no public self-registration.
- Payment amounts are decided only by the server. Mock payments are refused in production, and live Razorpay keys are never used outside production.
- Never print, log or commit values from `.env.local`. Mask secrets in any output (`abcd…`).
- The Atlas cluster also holds another project's database `meesho-admin`: **never read or write it**. This app uses only `product_hub`.

## Testing rules
- Purchase tests need `PAYMENT_MODE=mock ALLOW_MOCK_PAYMENTS=yes RAZORPAY_KEY_ID=rzp_test_selftestdummy` (mock is refused on Vercel, on non-test database names and with live keys) plus `SMTP_HOST=` and `NOTIFY_EMAIL=` empty so no email is sent. Never call Razorpay from tests.
- Never test against the real `product_hub` data. Use the throwaway local database:
  `MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=product_hub_selftest` (environment variables override `.env.local`).- Typical run: `npx next build`, seed a test admin with `scripts/seed-admin.mjs`, `npx next start -p 3123`, then `scripts/test-authz.mjs` with `TEST_BASE_URL=http://localhost:3123`.
- Delete test products through the API (that also removes their Cloudinary images), stop the server and drop `product_hub_selftest` when done.
- Browser checks: headless Chrome at `/Applications/Google Chrome.app` driven over CDP with `node --experimental-websocket`; keep throwaway scripts in the session scratchpad, not in the repo.
- Keep QA fast: test API behaviour with scripts (curl/node) and use the browser only for layout and flows that need it, with few screenshots.

## Git and release
- Never `git push`, change Vercel settings or delete production data without the owner's explicit approval in the current conversation.
- Commit messages end with the attribution trailer the session provides.

## Talking to the owner
- The owner writes in Hinglish (Hindi in Latin script). Final summaries for the owner are in simple Hinglish; code, comments and docs stay in English.
