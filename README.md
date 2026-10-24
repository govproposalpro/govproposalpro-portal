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

Deploy anywhere that runs Node 20+ behind HTTPS (Render, Railway, Fly, a VPS with Nginx). Set `TRUST_PROXY=1` behind a proxy so rate limiting sees real client IPs. Paste the public URL into the Whop PDF where it says `[INSERT YOUR CLAUDE-BUILT PAGE LINK HERE]`.

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

## Command Center (dashboard at `/app`)

The GovProposalPro app runs in this same service and database, so every login created on the
signup page works here unchanged.

```
/app                 Sign in, then the dashboard (static SPA in public/app, built from frontend/app)
POST /api/auth/login  bcrypt check, 8-strike lockout, purchase check, launch gate -> session cookie
GET  /api/me          profile, tier, monthly proposal usage, feature locks
/api/bids             Visual Bid CRM (Kanban CRUD + drag-and-drop reorder)
/api/decryptor        AI Bid Decryptor: PDF or pasted text -> structured one-page brief (Claude)
/api/proposals        AI Proposal Engine: Markdown proposal (Claude); Core 10 / Enterprise 50 per month
/api/me/profile       Business profile (UEI, CAGE, NAICS, capabilities, past performance...) used by every AI feature
/api/me/documents     Company documents (PDF) read by Claude; facts feed proposals and auto-fill the profile
/api/capability-statements  Capability Statement Generator
/api/me/sam-checklist SAM.gov Registration Checklist progress
/api/vetting          Sub-Safe SAM.gov Vetting (Enterprise): SAM.gov entity + exclusions lookup
/api/alerts           Deadline alerts feed; an hourly job emails 7/3/1-day bid and 60/30/7-day SAM reminders
/api/auth/forgot, /api/auth/reset, /api/me/password   Password reset and change
```

New members land on a four-step setup (upload documents, company basics, what you do, team and
past performance). The Subcontracting Limits Checker (FAR 52.219-14) runs entirely in the browser.
`src/app/playbook.md` is the proposal-writing playbook sent (cached) with every proposal request.

| Path | What it is |
| --- | --- |
| `src/app/tiers.js` | Tier caps and the feature list; the server enforces it and the UI renders locks from it. |
| `src/app/session.js` | Server-side sessions (HttpOnly `__Host-` cookie, SHA-256 at rest), purchase re-check on every request, same-origin guard. |
| `src/app/quota.js` | Monthly proposal cap with an advisory lock so parallel clicks can't overshoot it. |
| `src/app/ai.js` | Claude calls (model `claude-opus-5-5`, adaptive thinking, server-side refusal fallback). |
| `frontend/app/` | Dashboard source. `npm run build` writes `public/app/`. |

Security notes: a refund or cancellation (Whop webhook sets `revoked_at`) ends every session on the
member's next request; tier comes from the live purchase record; the CSP allows only same-origin
scripts and styles; uploaded RFPs are sent to Claude and never stored, only the summary is.

Env: `ANTHROPIC_API_KEY` (required for AI features), `APP_LAUNCH_AT` (sign-in opens at this time),
`APP_EARLY_ACCESS_EMAILS` (team accounts allowed in early), `DECRYPTS_PER_DAY` (default 25), `DOCS_PER_DAY` (default 15), `AI_DAILY_CALL_CAP` (site-wide Claude calls per day, default 300).

## Landing page and contract-win popups

- `govproposalpro.com/` (any host that is not `access.*`) serves the landing page from `frontend/site/`; `access.govproposalpro.com/` and `/access` serve signup.
- Buy buttons use `SITE_CTA_URL`, `WHOP_CORE_CHECKOUT_URL` and `WHOP_ENTERPRISE_CHECKOUT_URL` (https only).
- Win popups read `/api/public/wins` (40 random published wins, CORS open, rate limited). Manage them in Admin > Contract wins. The 500 starting wins in `db/seed/contract-wins.json` load once when the table is empty.
- The landing page's live pill, member wins wall and agency strip read `/api/public/wins/stats` (published wins only, cached 5 minutes). Those sections stay hidden if there are no published wins.
- The site font is Inter, self-hosted in `public/assets/fonts/` under the SIL Open Font License.
- To show the popups on a site hosted elsewhere (for example GoHighLevel), paste `<script src="https://access.govproposalpro.com/embed/wins.js" defer></script>` into its footer.
- Product images in `public/assets/site/` are screenshots of the real app.
- `/terms` and `/privacy` are in `frontend/site/`. Set `LEGAL_ENTITY`, `LEGAL_STATE` and `SUPPORT_EMAIL` to fill in the legal name, governing-law state and contact email.

## Admin dashboard (at `/admin`)

For the team and VAs to manage members, logins and access. Separate accounts, cookie and sessions
from members; every admin uses a password plus an authenticator app code, and every action is
written to an audit log.

- **Owners** (`ADMIN_OWNER_EMAILS`): everything, plus Team (add/disable admins, send setup links) and
  the audit log. Created on deploy and emailed a one-time setup link (72 hours). If email is not
  configured the link is printed in the deploy log, or run `npm run admin:link -- you@example.com`
  in the Render Shell.
- **VAs** (`ADMIN_VA_EMAILS`): Members (edit profile, tier, disable; send a password reset link,
  unlock, sign out everywhere) and Access (generate access for an email, change tier, revoke).
  An owner sends each VA a setup link from Team.
- Nobody ever sees or sets a member's password: members choose it from a one-time link
  (reset links last 60 minutes, invites 7 days).
- "Generate access" approves an email the same way a Whop purchase does and, when the person has
  no login yet, creates one and sends an invite link.
