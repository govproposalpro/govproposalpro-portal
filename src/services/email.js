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

function buildWelcomeEmail({ email, tier }) {
  const edition = tier === 'enterprise' ? 'Enterprise Edition' : tier === 'core' ? 'Core Edition' : 'GovProposalPro';
  const subject = 'Your GovProposalPro credentials are secured';

  const text = [
    'Welcome to the CEO Seat.',
    '',
    `Your ${edition} login has been created for ${email}.`,
    'Your automated environment is being provisioned.',
    '',
    `Full access to the GovProposalPro command center will be delivered to this inbox on ${LAUNCH_DATE}.`,
    'You will sign in with the exact email and password you just created.',
    '',
    'For your security, we will never ask for your password by email.',
    '',
    '- Jalen & The Contract Bros Team',
  ].join('\n');

  const safeEmail = escapeHtml(email);
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F5F7FB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0A1F44;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FB;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:24px;box-shadow:0 12px 40px -8px rgba(10,31,68,0.14);">
        <tr><td style="padding:40px 36px 8px 36px;">
          <p style="margin:0 0 6px 0;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:600;color:#B8860B;">GovProposalPro</p>
          <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:600;color:#0A1F44;">Credentials secured.</h1>
        </td></tr>
        <tr><td style="padding:16px 36px 8px 36px;font-size:15px;line-height:1.6;color:#16397A;">
          <p style="margin:0 0 14px 0;">Your <strong style="color:#0A1F44;">${edition}</strong> login has been created for <strong style="color:#0A1F44;">${safeEmail}</strong>. Your automated environment is being provisioned.</p>
          <p style="margin:0 0 14px 0;">Full access to the GovProposalPro command center will be delivered to this inbox on <strong style="color:#0A1F44;">${LAUNCH_DATE}</strong>. You will sign in with the exact email and password you just created.</p>
        </td></tr>
        <tr><td style="padding:8px 36px 0 36px;">
          <div style="border-radius:16px;background:#FBF6E9;border:1px solid #F2D58A;padding:14px 16px;font-size:13px;line-height:1.5;color:#0A1F44;">
            For your security, we will never ask for your password by email.
          </div>
        </td></tr>
        <tr><td style="padding:28px 36px 40px 36px;font-size:14px;color:#16397A;">
          Welcome to the empire.<br/>Jalen &amp; The Contract Bros Team
        </td></tr>
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
