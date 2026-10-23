# Product Hub

Admin panel for managing products and preparing marketplace listings (Meesho first, more marketplaces can be added from the UI).

**Stack:** Next.js 16 (App Router, JavaScript only) · MongoDB (native driver) · Cloudinary (REST API via `fetch`). No other runtime dependencies.

## Setup

1. Install dependencies (Node.js 20.9+):
   ```bash
   npm install
   ```
2. Copy the environment template and fill it in:
   ```bash
   cp .env.example .env.local
   ```
   - `AUTH_SECRET`: at least 32 random characters, for example `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
   - `CLOUDINARY_*`: from the Cloudinary console (Dashboard → API Keys). These stay on the server.
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
5. Sign in as the Admin, open **User Management** and create the Listing User's account with a temporary password. They are asked to change it after signing in.

There is no sign-up page and no registration endpoint. `POST /api/users` (Admin only) is the only way accounts are created.

## Tests

`scripts/test-authz.mjs` runs about 90 end-to-end checks against a running server. It covers unauthenticated access, listing-user restrictions on every admin endpoint, sensitive-field stripping, mass-assignment, listing workflow limits, inventory history, pricing maths, deactivation, password resets, CSRF and logout. It cleans up the records it creates. Stock movements and activity logs are kept because they are history.

```bash
npm start   # in one terminal
TEST_BASE_URL=http://localhost:3000 TEST_ADMIN_PASSWORD='your-admin-password' npm run test:authz
```

## How it works

### Authentication
- Passwords are hashed with `crypto.scrypt` (random salt per user) and compared in constant time.
- Login creates a random 256-bit session token. Only an HMAC of it (keyed with `AUTH_SECRET`) is stored, in the `sessions` collection, which has a TTL index. The browser gets an `httpOnly`, `SameSite=Lax` cookie, which is also `Secure` in production.
- Every request loads the user from MongoDB again. Deactivating a user, resetting their password or changing their role takes effect on their next request, and their sessions are deleted.
- State-changing requests from another origin are rejected. Failed logins are throttled per email and per IP.

### Role permissions (enforced in every route handler)
| | Admin | Listing User |
|---|---|---|
| Products: view | All, including costs, profit, stock and supplier | Active products only. Costs, profit, exact stock, supplier and internal notes are stripped on the server |
| Products, categories, fields, images: change | ✔ | ✖ 403 |
| Image download / ZIP | ✔ | ✔ |
| Listing content | Create, edit, delete | View and copy |
| Listing status and notes | ✔ | ✔ (only `status` is accepted in a PATCH; notes are append-only) |
| Inventory, pricing, users, marketplaces | ✔ | ✖ 403 |

### Collections
- `users`: name, email (unique), role, `passwordHash`, `isActive`, `mustChangePassword`, `lastLoginAt`
- `sessions`: `tokenHash`, `userId`, `expiresAt` (TTL)
- `categories`: name, slug, `isActive`, `fields[]` (`id`, `key`, `label`, `type`, `options`, `required`, `order`, `helpText`)
- `products`: core fields, costs, `stock`, `lowStockThreshold`, `customFields{key: value}`, `images[]` (Cloudinary `publicId`, `url`, `label`; the first image is the main image)
- `marketplaceListings`: `productId` + `marketplace` (unique together), title, description, style ID, keywords, attributes, highlights, pack quantity, suggested price, status, `notes[]`
- `marketplaces`: key and name (Meesho is created automatically)
- `stockMovements`: append-only history (type, change, before and after, reason, user)
- `activityLogs`: important admin and listing actions

Stock changes only through stock movements. Product edits cannot overwrite it. Renaming a category field's key moves the stored product values to the new key.

### Fill a product from a screenshot
On **Add Product**, the admin can upload or paste (Ctrl+V) a screenshot of a marketplace form, such as Meesho's "Add Catalog" page. The browser cuts tall screenshots into overlapping slices so small text stays readable, and the admin-only route `POST /api/products/extract` sends the slices to Claude (`claude-opus-5-5`, structured JSON output). Claude returns:
- every label/value pair it sees, in on-screen order;
- the best-matching category, filled with that category's fields;
- values mapped onto the core product fields.

The form is filled and the filled fields are highlighted, but nothing is saved. The label/value pairs become an editable "Meesho listing" draft, which is saved as the product's Meesho listing only when the admin clicks **Create product**. This needs `ANTHROPIC_API_KEY`, and each screenshot costs a few cents of API usage.

### Images
Image files never pass through the app server, so hosting request and response size limits (for example 4.5 MB on Vercel) don't apply:
- **Upload:** the admin's browser asks `POST /api/products/:id/images/sign` for a signature. The signature only allows image formats, only this product's folder, and expires after about 1 hour; the API secret stays on the server. The browser uploads the file directly to Cloudinary, with a progress bar. The server then looks up the `publicId` through Cloudinary's Admin API, checks it is in that product's folder, and stores the metadata Cloudinary returns.
- **Download / ZIP:** the browser fetches the images from Cloudinary (which allows this via CORS) and builds the ZIP locally with `src/lib/zip.js`, a small dependency-free ZIP writer.

MongoDB stores only image metadata (`publicId`, URL, label, order).
