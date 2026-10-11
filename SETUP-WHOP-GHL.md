# Go-live checklist: Whop + GoHighLevel

About 30–45 minutes. Do the parts in order, because each one hands a URL or secret to the next.
Menu names in Whop and GoHighLevel change from time to time, so if a label below doesn't match exactly, look for the closest one.

## Why there are three pieces

GoHighLevel hosts the page buyers see, but it can't run the backend code or keep a secure database of hashed passwords. GoHighLevel custom fields store values as readable text, so passwords must never go there. A small backend therefore runs on Render, and the GoHighLevel page sends the form to it.

```
Whop (buyer pays, gets PDF + link)
   -> GoHighLevel funnel page (the form buyers see)
        -> Render backend (checks purchase, hashes password, saves to Postgres)
             -> GoHighLevel workflow (sends the welcome email)
```

---

## Part 1: Deploy the backend on Render (about 10 min)

1. Put the `credential-portal` folder in a GitHub repository. A private repo is fine.
2. Sign in at render.com and choose **New → Blueprint**, then pick that repo. Render reads `render.yaml` and creates:
   - a web service called `govproposalpro-portal`
   - a Postgres database called `govproposalpro-db`

   Render shows the monthly cost before it creates anything. The defaults are the Starter web service and the Basic database.
3. When Render asks for the values marked `sync: false`, you can leave them blank for now. You'll fill them in during Parts 2 and 3.
4. Once it's live, open `https://<your-service>.onrender.com/healthz`. It should show `{"ok":true}`. **Copy this base URL**, because you need it in Part 2.

The database tables are created automatically on every deploy.

## Part 2: GoHighLevel (about 15 min)

### 2a. The page

1. Go to **Sites → Funnels → New Funnel → From Blank** and name it `GovProposalPro Access`.
2. Add a step called `Setup` with the path `/setup`, then edit the page.
3. Delete the default sections. Add a full-width section and drop in a **Custom JS/HTML** (Code) element.
4. Open `ghl/ghl-embed.html` and find this line near the bottom:
   ```js
   var API_BASE = 'https://YOUR-BACKEND-URL';
   ```
   Replace it with your Render URL from Part 1, for example `https://govproposalpro-portal.onrender.com`. Then paste the **whole file** into the Code element and save.
5. In the funnel **Settings**, connect your domain or subdomain (for example `access.yourdomain.com`). Also set the page to **noindex** if that option is offered.
6. **Publish**. Your buyer link is now something like `https://access.yourdomain.com/setup`.
7. Go back to Render. Under **Environment**, set `ALLOWED_ORIGINS` to your page's origin: `https://access.yourdomain.com` (just the scheme and host, with no path and no trailing slash). Save, and Render redeploys. If you skip this, the form shows "Network error", because the backend refuses requests from domains it doesn't know.

### 2b. The welcome email

1. Go to **Automation → Workflows → Create Workflow → Start from scratch**.
2. For the trigger, choose **Inbound Webhook**. Copy the webhook URL it gives you.
3. In Render, set `GHL_WEBHOOK_URL` to that URL and save.
4. Submit one test signup so GoHighLevel can see a sample payload. (Add your own email to the allowlist first, as described in Part 3, step 4.) The payload looks like this:
   `{ "email": "...", "tier": "core|enterprise", "event": "credentials_secured", "launch_date": "2026-10-18" }`
5. Add the action **Create/Update Contact**, mapping Email to `email`. Optionally add the tag `gpp-credentials-secured`, plus a tag from `tier`.
6. Add the action **Send Email**. Suggested subject: *Your GovProposalPro credentials are secured*. Suggested body (never include the password):
   > Welcome to the CEO Seat. Your GovProposalPro login has been created and your automated environment is being provisioned. Full access to the command center will be delivered to this inbox on Sunday, October 18th. You'll sign in with the exact email and password you just created. For your security, we will never ask for your password by email. — Jalen & The Contract Bros Team
7. **Publish** the workflow.

Note: Inbound Webhook is a premium workflow trigger in some GoHighLevel plans. If your account doesn't have it, switch the backend to SMTP instead (`EMAIL_PROVIDER=smtp` plus the `SMTP_*` settings in `.env.example`), and the backend sends the email itself.

## Part 3: Whop (about 10 min)

1. **Paste the link into the PDF.** In `whop/GovProposalPro_Access_Instructions.pdf` the link reads `[INSERT YOUR CLAUDE-BUILT PAGE LINK HERE]`. Send me the live link and I'll regenerate the PDF with it filled in.
2. **Deliver it.** In your Whop product, add the PDF as the deliverable (for example through a Files/content app). Also put the setup link in the product's welcome message or a Link app, so buyers can reach it without opening the PDF.
3. **Auto-approve buyers (webhook).** Go to Whop **Developer → Webhooks → Create webhook** and set:
   - URL: `https://<your-service>.onrender.com/api/webhooks/whop`
   - Events: membership becomes valid / payment succeeded, plus membership becomes invalid / payment refunded (refunds revoke signup access)

   Copy the signing secret into Render's `WHOP_WEBHOOK_SECRET`. Then use Whop's **test** button. If the Render logs show `401 invalid signature` or `had no usable email`, send me the log line and I'll adjust the handler to match Whop's exact format.
4. **Backfill and fallback.** Export your current customers from Whop as a CSV. In Render, open the service **Shell** and run:
   ```bash
   npm run import:whop -- whop-export.csv enterprise   # or core
   ```
   To add one person by hand (for example yourself, for testing), use Render's database **Connect → PSQL**:
   ```sql
   INSERT INTO authorized_purchasers (email, tier) VALUES ('you@yourdomain.com', 'enterprise');
   ```

## Part 4: Test it once, end to end

1. Add your own email to the allowlist (Part 3, step 4).
2. Open the live GoHighLevel link, create a password and click **Secure My Account**. You should see "Credentials secured."
3. Check that the welcome email arrived and that a contact appeared in GoHighLevel.
4. Submit again with the same email. You should see "An account already exists".
5. Try an email that isn't a buyer. You should see "We could not find a GovProposalPro purchase".
