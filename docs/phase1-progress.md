# Phase 1 progress: stopped for the day on 29 Oct 2026

Spec: `docs/phase1-spec.md`. Shared rules: `CLAUDE.md`. Nothing from Phase 1 has been committed or pushed yet.

## Done in wave 1 (agent reported finished)
- **database-admin**
  - Phase 1 indexes in `src/lib/db.js`.
  - `scripts/migrate-resellers.mjs`:
    - dry run by default; writes with `--apply --comp-until=YYYY-MM-DD --backup-dir=...`;
    - copies a shared listing into a reseller's tracker only when that reseller worked on it (owner approved);
    - tested on the selftest database.
  - **Not yet run on the real `product_hub`.** That needs the owner's approval.
- **email (backend-dev acting as email-manager)**
  - `src/lib/mailer.js` (GoDaddy SMTP, 465 TLS), `src/lib/outbox.js` (queue, daily cap, retries, encrypted secret) and `src/lib/emailTemplates.js` (welcome, receipt and owner alerts).
  - A live test sent 3 emails to contact@casestores.in. **Waiting on the owner:** did they land in the inbox or in spam, and do they look right?
- **backend-dev (access)**
  - `src/lib/access.js`, plus changes to `auth.js`, `products.js`, `listings.js`, `listingWriter.js` and `constants.js`.
  - Product, listing, category and dashboard routes now apply category scope, the plan check (402 when expired) and reseller isolation.
  - New routes: `my-listings/**`, `my-categories`, `preview/**`.
  - `scripts/test-authz.mjs` was rewritten for the new rules.

- **frontend-dev (public site):** finished. `src/app/(public)/**` (home page, legal pages, `/buy`, `/buy/status` with a TEST MODE panel), `src/app/renew/**` (blurred grid and its own logout), `src/lib/site.js`, and the public CSS block. The root `src/app/page.js` was removed, so `/` is now the marketing home page. Noindex was added to the `(app)` layout and the login page. **Not built or seen in a browser yet.**

## Still running when we stopped (check the state first tomorrow)
- **backend-dev (commerce):** `plans.js`, `payments.js` (mock and Razorpay), `coupons.js`, `subscriptions.js`, `tokens.js` and `rateLimit.js` (both of which may already exist), `users.js`, and the routes `api/plans`, `checkout/*`, `webhooks/razorpay`, `cron/daily`, `coupons/*`, `subscriptions`, `payments/*` and `users/*` (plan, access, resend-welcome).

If the session ended before they finished, these files may be partly written. Tomorrow:
1. Run `git status`, then read each file and check it against the spec.
2. Finish or redo the missing parts with the same agents.

## Next steps
1. Finish wave 1, then run `npx next build`.
   - Run the full `scripts/test-authz.mjs` on the throwaway database.
2. Wave 2 (frontend-dev):
   - Admin: AppShell nav, Subscriptions page (shows the temporary password while it is pending), Coupons page, and the user access editor.
   - Reseller: My Listings, My Categories, and the reseller view of ListingPanel/ListingView/ListingGenerator. That view currently uses the shared notes and status, which now return 403 for resellers.
   - Product form: category is required, with a "+ New category" popup.
   - `client.js`: send the browser to `/renew` on a 402.
3. Reviews, in this order: docs-writer, code-reviewer, security-auditor, then qa-tester. For the security audit, note that preview tokens are signed but not encrypted, so the product id inside can be read.
4. Release with the owner's approval:
   - Vercel environment variables: `PAYMENT_MODE` (razorpay in production), the `SMTP_*` settings, `MAIL_FROM`, `MAIL_FROM_NAME=Product Hub`, `NOTIFY_EMAIL`, `MAIL_DAILY_LIMIT`, `CRON_SECRET` and `PUBLIC_BASE_URL`.
   - Razorpay webhook URL.
   - Migration: dry run, owner approval, then `--apply`.
   - Deploy, then a live ₹1 test with a coupon, then refund it.

## Decisions waiting on the owner
- Whether the test emails arrived in the inbox or in spam. If they went to spam, turn on DKIM in GoDaddy.
- Approval to run the migration on the real data, and the comp end date (suggested: 2026-12-31).
- The details for Harsh's ₹1 coupon.
- The details for the legal pages (these can stay generic for now).

## Update 30 Oct 2026
- The commerce backend is finished and builds. Docs are finished: README, `.env.example`, `docs/owner-guide-hinglish.md`, and CLAUDE.md, which I edited myself.
- `vercel.json` now schedules `/api/cron/daily` at 03:30 UTC (09:00 IST). Vercel sends `Authorization: Bearer $CRON_SECRET`, so `CRON_SECRET` must be set.
- For the security audit:
  - Mock mode is blocked only by `VERCEL_ENV === 'production'`.
  - The per-email coupon limit is checked only at quote and order time, so two quick orders could both get it.
  - Preview tokens are signed but not encrypted.
- For the owner:
  - Buying a plan while on free (comp) days drops the remaining free days. The paid plan starts on the purchase date.
  - Admin-created resellers with comp days and no plan code can't pick their own categories. The admin grants them.
- Release env checklist adds `PUBLIC_BASE_URL` (email login links break without it) and `NOTIFY_EMAIL` (owner alerts are skipped without it).

## Update 30 Oct 2026 (later)
- Wave 2 is finished (admin and reseller screens). The code review and security audit are done. Every high and medium finding is fixed: the mock guard, comp stacking, migration all-access via `allAccessUntil`, all-access on extend, the stranger-buy protection, coupon reservations, the blurred and proxied home-page images, webhook processing state, Mongo-backed login throttle, and the others.
- `test-authz.mjs`: 236 passed, 0 failed.
- `.env.local`: `PAYMENT_MODE=razorpay`; the leftover `ADMIN_PASSWORD` was removed. The real `product_hub` was checked and is clean.
- Next: qa-tester browser end-to-end run, then release with the owner's approval.

## Update 30 Oct 2026 (QA)
- The qa-tester end-to-end run is finished. All 12 journeys pass.
- Fixed after QA:
  - Mobile sideways scroll on the reseller product page (`.detail-layout` now uses `minmax(0, 1fr)` below 1100px).
  - Missing favicon (`src/app/icon.svg`).
  - The spec now documents the 402 body as `{ error, details: { code } }`, which is what the code returns.
- Left as is (low): `test-authz` leaves test payments in the throwaway DB, which is dropped anyway; `BuyForm` loads Razorpay `checkout.js` in mock mode too.
- After the fixes: build passes, `test-authz.mjs` 236 passed, 0 failed.
- Next: owner's single release approval (push, migration `--apply`, Vercel env, Razorpay webhook, live ₹1 test).
