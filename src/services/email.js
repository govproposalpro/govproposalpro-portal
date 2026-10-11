'use strict';

const nodemailer = require('nodemailer');

const PROVIDER = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();
const LAUNCH_DATE = 'Sunday, October 18th';

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587 (STARTTLS)
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      requireTLS: process.env.SMTP_SECURE !== 'true',
    });
  }
  return transporter;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://assets.cdn.filesafe.space/2c9ZJNooQ8eEnTMWsHaX/media/6a8dec9e56f37ac03c83343c.png';

function buildWelcomeEmail({ email, tier, firstName = '' }) {
  const edition = tier === 'enterprise' ? 'Enterprise Edition' : tier === 'core' ? 'Core Edition' : 'GovProposalPro';
  const subject = 'Your GovProposalPro access is secured';
  const greeting = firstName ? `Welcome to the CEO Seat, ${firstName}.` : 'Welcome to the CEO Seat.';

  const text = [
    greeting,
    '',
    `Your ${edition} login has been created for ${email}.`,
    'A member of the GovProposalPro team will reach out shortly to confirm your access and walk through your setup.',
    '',
    `Full access to the GovProposalPro command center will be delivered to this inbox on ${LAUNCH_DATE}.`,
    'You will sign in with the exact email and password you just created.',
    '',
    'For your security, we will never ask for your password by email or phone.',
    '',
    'Kinno & Jalen',
    'The ContractBros',
  ].join('\n');

  const safeEmail = escapeHtml(email);
  const safeGreeting = escapeHtml(greeting);
  const html = `<!DOCTYPE html>
<html><head><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:#05081A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#EEF1FF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05081A;padding:36px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding:0 0 24px 0;">
          <img src="${LOGO_URL}" width="300" alt="GovProposalPro by Contract Bros" style="display:block;width:300px;max-width:80%;height:auto;border:0;" />
        </td></tr>
        <tr><td style="background:#0E1533;border:1px solid #1E2A5C;border-radius:28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:6px;border-radius:28px 28px 0 0;background:#1E5BFF;background-image:linear-gradient(90deg,#1E5BFF,#5B3BFF,#FF1F3D);font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td style="padding:34px 34px 6px 34px;">
              <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;color:#FF8A9A;">Access secured</p>
              <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:700;color:#FFFFFF;">${safeGreeting}</h1>
            </td></tr>
            <tr><td style="padding:16px 34px 4px 34px;font-size:15px;line-height:1.65;color:#BAC4EA;">
              <p style="margin:0 0 14px 0;">Your <strong style="color:#FFFFFF;">${edition}</strong> login has been created for <strong style="color:#FFFFFF;">${safeEmail}</strong>.</p>
              <p style="margin:0 0 14px 0;">A member of the GovProposalPro team will reach out shortly to <strong style="color:#FFFFFF;">confirm your access</strong> and walk through your setup.</p>
              <p style="margin:0 0 14px 0;">Full access to the command center will be delivered to this inbox on <strong style="color:#FFFFFF;">${LAUNCH_DATE}</strong>. You'll sign in with the exact email and password you just created.</p>
            </td></tr>
            <tr><td style="padding:6px 34px 0 34px;">
              <div style="border-radius:18px;background:#151E45;border:1px solid #2B3A78;padding:14px 16px;font-size:13px;line-height:1.5;color:#BAC4EA;">
                &#128274; For your security, we will never ask for your password by email or phone.
              </div>
            </td></tr>
            <tr><td style="padding:26px 34px 34px 34px;font-size:14px;line-height:1.6;color:#BAC4EA;">
              Welcome to the empire.<br/><strong style="color:#FFFFFF;">Kinno &amp; Jalen</strong><br/>The ContractBros
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:20px 0 0 0;font-size:12px;color:#6B78A8;">GovProposalPro &middot; Contract Bros</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

async function sendViaSmtp({ email, tier }) {
  const { subject, text, html } = buildWelcomeEmail({ email, tier });
  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
    to: email,
    subject,
    text,
    html,
  });
}

// GoHighLevel alternative: POST the contact to a workflow's Inbound Webhook trigger and let the
// GHL workflow send the email (and tag the contact) from your GHL account.
async function sendViaGoHighLevel({ email, tier }) {
  const url = process.env.GHL_WEBHOOK_URL;
  if (!url) throw new Error('GHL_WEBHOOK_URL is not set');

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      tier: tier || 'unknown',
      event: 'credentials_secured',
      launch_date: '2026-10-18',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`GoHighLevel webhook responded ${res.status}`);
}

/**
 * Sends the "credentials secured" confirmation. Call only after the Users insert succeeds.
 * Never pass the password here; the email confirms setup without echoing secrets.
 */
async function sendWelcomeEmail({ email, tier = null }) {
  if (PROVIDER === 'ghl') return sendViaGoHighLevel({ email, tier });
  return sendViaSmtp({ email, tier });
}

module.exports = { sendWelcomeEmail, buildWelcomeEmail };
