# GovProposalPro Credential Capture Portal

Pre-launch page where Whop buyers create their GovProposalPro login before the October 18th launch.

```
Buyer clicks link in Whop -> GET /  (public/index.html)
  -> POST /api/register  { email, password, confirmPassword }
       1. validate email + password rules (server side)
       2. confirm the email is a paid Whop buyer (authorized_purchasers)
       3. bcrypt hash (12 rounds) -> INSERT into "Users"
       4. 200 OK -> page swaps to the "Credentials secured." message
       5. welcome email sent (Nodemailer SMTP or GoHighLevel webhook)
```

## Files

| Path | What it is |
| --- | --- |
| `public/index.html` | **Deliverable 1.** The finished single-file page (Tailwind compiled and inlined, vanilla JS). |
| `frontend/index.html` | Editable source of the page. Run `npm run build` after editing to regenerate `public/index.html`. |
| `src/routes/register.js` | **Deliverable 2.** The Express `POST /api/register` route. |
| `src/services/email.js` | **Deliverable 3.** `sendWelcomeEmail()`: Nodemailer by default, GoHighLevel webhook if `EMAIL_PROVIDER=ghl`. |
| `src/routes/whopWebhook.js` | Optional Whop webhook that adds paid buyers to the allowlist automatically. |
| `scripts/import-whop-csv.js` | Loads buyers from a Whop customer CSV export into the allowlist. |
| `db/schema.sql` | `Users` and `authorized_purchasers` tables (PostgreSQL). |
| `src/server.js` | App wiring: security headers, CSP, routes. |
| `ghl/ghl-embed.html` | The same page as a paste-in block for a GoHighLevel funnel Code element. |
| `render.yaml` | One-click Render deploy for the backend + Postgres. |
| `SETUP-WHOP-GHL.md` | Click-by-click go-live checklist for Render, GoHighLevel and Whop. |

## Setup

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, SMTP or GHL settings
npm run db:migrate              # creates the tables
npm start                     # serves on PORT (default 3000)
```

Deploy anywhere that runs Node 18+ behind HTTPS (Render, Railway, Fly, a VPS with Nginx). Set `TRUST_PROXY=1` behind a proxy so rate limiting sees real client IPs. Paste the public URL into the Whop PDF where it says `[INSERT YOUR CLAUDE-BUILT PAGE LINK HERE]`.

## The purchase gate (important)

The page link is shared inside Whop, so anyone who gets hold of it could otherwise create an account. With `REQUIRE_PURCHASE=true` (the default), only emails in `authorized_purchasers` can register. Buyers are told to use their Whop checkout email. Fill the allowlist one of two ways:

1. **CSV import (works today).** Export your customers from the Whop dashboard and run
   `npm run import:whop -- ./whop-export.csv enterprise` (or `core`). Safe to re-run as new buyers come in.
2. **Webhook (automatic).** In Whop, add a webhook pointing to `https://YOUR-DOMAIN/api/webhooks/whop` and put its signing secret in `WHOP_WEBHOOK_SECRET`. The handler verifies signatures using the Standard Webhooks format and reads the buyer email from the event. Send a test event from Whop and check the server log before relying on it; if Whop's payload or signature headers differ, adjust `extract()` / `verifySignature()` in `src/routes/whopWebhook.js`. Optional: set `WHOP_ENTERPRISE_PRODUCT_IDS` / `WHOP_CORE_PRODUCT_IDS` (comma-separated) to record each buyer's tier.

To add a single buyer by hand:

```sql
INSERT INTO authorized_purchasers (email, tier) VALUES ('buyer@company.com', 'enterprise');
```

Set `REQUIRE_PURCHASE=false` only if you deliberately want an open signup.

## Security notes

- Passwords: 12+ characters with upper, lower and a number; checked in the browser and again on the server. Over 72 bytes is rejected because bcrypt silently truncates beyond that.
- Hashing: bcrypt, 12 rounds (`BCRYPT_ROUNDS`, minimum 10). Plain-text passwords are never logged, stored or emailed.
- Duplicate emails: case-insensitive unique index; a second signup gets a 409 with a friendly message.
- Rate limiting: 10 attempts per IP per 15 minutes on `/api/register`.
- Headers: Helmet with a strict Content Security Policy. The page loads no third-party scripts or fonts; its inline script and style are allowed by hash, computed at startup. HSTS on, framing blocked.
- SQL: parameterized queries only.
- Email sends after the 200 response, so a slow mail server never delays the success screen; `welcome_email_sent_at` records which buyers got it.

## Welcome email

- **SMTP (default):** set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`. Use a provider with SPF/DKIM set up for your domain (Postmark, SendGrid, Amazon SES, Google Workspace) so it lands in the inbox.
- **GoHighLevel:** create a workflow with an *Inbound Webhook* trigger, set `EMAIL_PROVIDER=ghl` and `GHL_WEBHOOK_URL`. The app posts `{ email, tier, event: "credentials_secured", launch_date }` and your GHL workflow sends the email.
