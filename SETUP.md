# Shipping Dynamic Carts

Everything here is optional — the store boots and runs fully in **demo mode** with
no configuration at all. Each integration switches itself on the moment its
environment variables are present.

---

## 0. The shape of it

```
.env.local          <- all your secrets live here (never commit this)
   |
   +-- DATABASE_URL ......... PostgreSQL (Supabase OR Neon - see 1A / 1B)
   +-- SESSION_SECRET ....... HMAC key that signs the login cookie
   +-- GOOGLE_CLIENT_ID  \
   +-- GOOGLE_CLIENT_SECRET  > Google Cloud Console OAuth (section 3)
   +-- GOOGLE_REDIRECT_URI /
   +-- MAILGUN_API_KEY   \  Mailgun order confirmations (section 2)
   +-- MAILGUN_DOMAIN     >
   +-- MAILGUN_FROM       /
```

Create the file in the project root:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
SESSION_SECRET=<see below>
```

### Generating `SESSION_SECRET`

This signs your session cookie. Anyone who knows it can forge a login.

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## 1A. Supabase (PostgreSQL)

1. Go to **supabase.com** → sign up → **New project**.
   - Pick a region close to your users (London / Frankfurt for Nigeria).
   - Save the database password — you will need it in step 3.
   - Wait ~2 minutes while it provisions.

2. **Settings → Database → Connection string → URI**.
   Switch the method toggle from *Session* to *Transaction pooler* (port `6543`),
   then **Reset** the password if it was auto-generated and copy it.

3. Add to `.env.local`:

   ```bash
   DATABASE_URL=postgresql://postgres.PROJECT-REF:PASSWORD@aws-0-eu-west-1.pooler.supabase.com:6543/postgres
   DATABASE_SSL=true
   ```

   > The pooler hostname contains your project ref and region — copy it exactly.
   > Keep the password URL-encoded if it contains `@ : / # ?`.

4. **Apply the schema and seed it:**

   ```bash
   npm run db:setup
   ```

   That runs `scripts/apply-schema.mjs` then `scripts/seed.mjs`. Both are
   re-runnable (`CREATE TABLE IF NOT EXISTS`), so it is safe against a database
   that already exists.

5. Restart the dev server. The demo banner disappears once the catalogue is
   being served from Postgres.

### Supabase extras worth knowing

- **Row Level Security**: this app connects as the table owner and enforces
  authorisation in application code, so leave RLS off. If you enable it later you
  must also switch the app to the Supabase JS client with per-user policies.
- **PgBouncer / the pooler is required** on the free tier for serverless.
  Locally a direct connection (port `5432`) also works — just use that URL.

---

## 1B. Neon (PostgreSQL)

1. Go to **neon.tech** → sign up → **Create a project**.
   - Region: pick the one nearest your users.
   - Plan: Free is fine to start.

2. Neon shows a connection string immediately. Choose the **pooled** one
   (it ends `-pooler` and carries `?pgbouncer=true`).

3. Add to `.env.local`:

   ```bash
   DATABASE_URL=postgresql://USER:PASSWORD@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true
   DATABASE_SSL=true
   ```

4. **Apply the schema and seed it:**

   ```bash
   npm run db:setup
   ```

5. Restart the dev server.

### Neon extras worth knowing

- The pooled endpoint **does not support prepared statements**, which is fine
  here because `pg` does not use them by default.
- Neon auto-suspends after inactivity, so the first query after a cold start can
  take ~1s. Nothing to configure.
- **Branches** let you create a `dev` branch and point a second `.env.local` at
  it, keeping production data untouched.

### Supabase vs Neon — which one?

| | Supabase | Neon |
|---|---|---|
| Free tier | 500 MB, pauses after 1 week inactivity | 0.5 GB, compute scales to zero |
| Connection | Pooler required on free | Pooled endpoint included |
| Branches | Preview branches (Pro) | Branches on every plan |
| Also gives you | Auth, Storage, Edge Functions | Pure Postgres |

Either works identically here — the app only speaks the PostgreSQL wire protocol
via `pg`, so switching providers is a one-line change to `DATABASE_URL`.

---

## Cleaning up test orders

`npm run db:seed` refreshes the catalogue and resets stock, but it deliberately
leaves the `orders` table alone — real orders must survive a reseed. That leaves
checkout smoke-tests behind:

```bash
npm run db:clear-orders            # delete only orders on test/example addresses
npm run db:clear-orders -- --all   # delete every order (destructive)
```

It restores stock from `db/seed.sql` afterwards, and **refuses to run** if it
finds any order that doesn't look like test data — so a real customer order can't
be removed by a stray invocation. You'd have to pass `--all` to get there.

---

## Handling secrets

`.env.local` is gitignored, but its contents have a habit of ending up in
screenshots and chat logs. If that happens, **rotate before deploying**:

| Variable | Where to rotate |
| --- | --- |
| `DATABASE_URL` password | Supabase → Project Settings → Database, or Neon → Settings |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console → Credentials → your OAuth client |
| `MAILGUN_API_KEY` | Mailgun → Account → API keys → Security |
| `SESSION_SECRET` | Generate a new one; this signs every session cookie |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Rotating `SESSION_SECRET` signs everyone out, which is expected.

**`NEXT_PUBLIC_APP_URL` must be a bare origin** — no path, no trailing slash.
The OAuth redirect URI is derived by appending `/api/auth/callback/google` to
it, so a stray path produces a doubled, invalid URI. `GOOGLE_REDIRECT_URI`
overrides that fallback, but don't delete it.

---

## 2. Mailgun (order confirmations)

1. Go to **mailgun.com** → sign up (free tier: 100 emails/day). Verify your email.

2. **Sending → Domains → Add Domain**.
   - Use a subdomain you control, e.g. `mail.yourshop.com` (recommended — it
     keeps your root domain's reputation clean).
   - Add the DNS records Mailgun shows you (TXT, MX, and two CNAMEs for DKIM).
     **This is the step people get wrong**, and verification can take up to
     48 hours (usually minutes).

3. Once the domain shows **Active**, copy:
   - **Private API key** (starts `key-`) — **Account → API keys → Security**, or
     **Sending → API keys**. Do not use the public key.
   - Your sending domain (`mail.yourshop.com`).
   - A verified sender on that domain, e.g. `orders@mail.yourshop.com`. Add it
     under **Sending → Addresses** if it is not listed.

4. Add to `.env.local`:

   ```bash
   MAILGUN_API_KEY=key-xxxxxxxx
   MAILGUN_DOMAIN=mail.yourshop.com
   MAILGUN_FROM="Dynamic Carts <orders@mail.yourshop.com>"
   ```

5. Restart the dev server and place a test order. The message id is recorded in
   `orders.confirmation_message_id` and the timestamp in
   `orders.confirmation_sent_at`.

### Troubleshooting Mailgun

| Symptom | Cause |
|---|---|
| `Mailgun responded 401` | Wrong private key, or public/private pair mismatched. |
| `Mailgun responded 400 … domain not found` | `MAILGUN_DOMAIN` must be the verified domain, not a full hostname. |
| Mail not arriving although `sent: true` | DNS not fully propagated, or the recipient is suppressed. Check **Sending → Logs**. |
| EU region account | Set `MAILGUN_API_HOST=api.eu.mailgun.org`. |

**With no Mailgun configured nothing breaks** — the email body is printed to the
server console, and the confirmation page tells the customer the order was
placed but the email could not be sent.

---

## 3. Google Cloud Console (sign-in)

1. Go to **console.cloud.google.com** → create or select a project.

2. **APIs & Services → Library** → enable **Google+ API** *(legacy)*. It is
   required for the OIDC `userinfo` scope this app requests.

3. **OAuth consent screen**:
   - Choose **External**.
   - App name, your email, developer contact email.
   - Scopes: add `.../auth/userinfo.email` and `.../auth/userinfo.profile`.
   - While the app is in *Testing*, add your own Gmail under **Test users** —
     you cannot sign in otherwise. Verification is only needed for external apps
     serving more than 100 users.

4. **Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Name: `Dynamic Carts`.
   - **Authorized JavaScript origins**: `http://localhost:3000`
     (plus your production domain).
   - **Authorized redirect URIs**: `http://localhost:3000/api/auth/callback/google`
     — **exact match**, no trailing slash. For production also add
     `https://yourshop.com/api/auth/callback/google`.

5. Copy the **Client ID** and **Client secret** into `.env.local`:

   ```bash
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/callback/google
   ```

6. Generate `SESSION_SECRET` (step 0) if you have not, then restart.

The header will now show **Sign in**. If it still reads "Google sign-in off", one
of the three Google variables or `SESSION_SECRET` is missing.

### How the flow works here

- `GET /api/auth/google` mints a `state` + PKCE pair, stores it in a 10-minute
  httpOnly cookie, and redirects to Google.
- Google returns to `/api/auth/callback/google`, which exchanges the code, reads
  the profile, upserts a `profiles` row keyed on Google's immutable `sub` (**not**
  the email, which can change), sets a 30-day signed session cookie, and
  redirects to `returnTo`.
- `returnTo` is restricted to same-origin relative paths, so
  `?returnTo=https://evil.test` cannot turn sign-in into an open redirect.

---

## 4. Real product photography

```bash
npm run images              # download any missing images
npm run images -- --force   # re-download everything
```

This downloads curated Unsplash photos into `public/products/` and writes the
paths into `data/catalogue.json`. If you have a database, re-run
`npm run db:seed` afterwards so `products.image_url` matches.

To use your own photography, drop files named `<slug>.jpg` into
`public/products/` and set `image_url` to `/products/<slug>.jpg` — or point it at
an absolute URL to serve from a CDN.

---

## 5. Going live checklist

- [ ] `SESSION_SECRET` is a fresh 48-byte random value, never committed
- [ ] `NEXT_PUBLIC_APP_URL` is your real https origin
- [ ] `GOOGLE_REDIRECT_URI` uses the https production URL
- [ ] `DATABASE_SSL=true` (the default) and the pooler endpoint
- [ ] Mailgun domain verified with SPF + DKIM + DMARC
- [ ] `npm run build` passes
- [ ] `.env.local` is in `.gitignore` (it is, by default)

---

## Troubleshooting: nothing switches on

| Symptom | Check |
|---|---|
| "Demo mode" banner still showing | Is `DATABASE_URL` set? Did you restart after editing `.env.local`? |
| Header says "Google sign-in off" | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` all present |
| Redirect URI mismatch | Must be character-for-character, including scheme and no trailing slash |
| `Could not reach the database` | Wrong password/host, or `DATABASE_SSL` mismatched to the provider |