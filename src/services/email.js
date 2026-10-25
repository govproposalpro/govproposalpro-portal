'use strict';

const nodemailer = require('nodemailer');

const PROVIDER = (process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();

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
const ACCESS_URL = process.env.ACCESS_URL || 'https://govproposalpro.com/access';
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://govproposalpro-portal.onrender.com').replace(/\/$/, '');
const GUIDE_URL = `${PUBLIC_BASE_URL}/assets/GovProposalPro_Access_Instructions.pdf`;
const LOGIN_URL = process.env.APP_LOGIN_URL || 'https://govproposalpro.com/app/login';
// Optional: the free onboarding call calendar (GoHighLevel). Left out of emails when not set.
const BOOKING_URL = /^https:\/\/[^\s"'<>]+$/.test((process.env.BOOKING_URL || '').trim()) ? process.env.BOOKING_URL.trim() : '';
const SIGNATURE_TEXT = ['Kinno & Jalen', 'The ContractBros'];

const editionName = (tier) => (tier === 'enterprise' ? 'Enterprise Edition' : tier === 'core' ? 'Core Edition' : 'GovProposalPro');

const P = 'margin:0 0 14px 0;';
const button = (href, label) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;"><tr><td style="border-radius:999px;background:#1E5BFF;background-image:linear-gradient(135deg,#1E5BFF 0%,#5B3BFF 45%,#FF1F3D 100%);">
  <a href="${href}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px;">${label}</a></td></tr></table>`;
const stepRow = (n, title, body) => `<tr><td style="padding:0 0 12px 0;"><div style="border-radius:18px;background:#151E45;border:1px solid #2B3A78;padding:14px 16px;font-size:14px;line-height:1.55;color:#BAC4EA;">
  <strong style="color:#FFFFFF;">${n}. ${title}</strong> ${body}</div></td></tr>`;

// Shared dark, blue/red branded layout used by every GovProposalPro email.
function layout({ eyebrow, heading, bodyHtml }) {
  return `<!DOCTYPE html>
<html><head><meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"></head>
<body style="margin:0;padding:0;background:#05081A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#EEF1FF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05081A;padding:36px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding:0 0 24px 0;">
          <img src="${LOGO_URL}" width="300" alt="GovProposalPro by Contract Bros" style="display:block;width:300px;max-width:80%;height:auto;border:0;" />
        </td></tr>
        <tr><td style="background:#0E1533;border:1px solid #1E2A5C;border-radius:28px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="height:6px;background:#1E5BFF;background-image:linear-gradient(90deg,#1E5BFF,#5B3BFF,#FF1F3D);font-size:0;line-height:0;">&nbsp;</td></tr>
            <tr><td style="padding:32px 34px 6px 34px;">
              <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:3px;text-transform:uppercase;font-weight:700;color:#FF8A9A;">${eyebrow}</p>
              <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:700;color:#FFFFFF;">${heading}</h1>
            </td></tr>
            <tr><td style="padding:16px 34px 4px 34px;font-size:15px;line-height:1.65;color:#BAC4EA;">${bodyHtml}</td></tr>
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
}

/** Sent the moment a GovProposalPro purchase lands on Whop: how to set up access. */
function buildPurchaseEmail({ tier, firstName = '' }) {
  const edition = editionName(tier);
  const subject = 'Action required: set up your GovProposalPro access';
  const greeting = firstName ? `Welcome to the CEO Seat, ${firstName}.` : 'Welcome to the CEO Seat.';

  const text = [
    greeting,
    '',
    `Congratulations on securing your GovProposalPro ${edition} license. Your private command center requires a secure, encrypted login. Please complete your setup now:`,
    '',
    `1. Initialize your account: ${ACCESS_URL}`,
    '2. Create your keys: use the same email you used to purchase on Whop and create a secure password.',
    '3. Tailor your command center: tell us about your business and experience level. A member of our team will reach out to confirm your access.',
    '',
    `As soon as your login is created, sign in to your Command Center: ${LOGIN_URL}`,
    BOOKING_URL ? `\nBook your free onboarding call and we'll walk through your first bid together: ${BOOKING_URL}` : '',
    '',
    `Setup guide (PDF): ${GUIDE_URL}`,
    'You can also find everything inside Whop under "GovProposalPro Access".',
    tier === 'enterprise' ? '\nAs an Enterprise member, your VIP Onboarding Concierge will reach out separately to collect your business details for your Done-For-You SAM.gov registration.' : '',
    '',
    ...SIGNATURE_TEXT,
  ].join('\n');

  const html = layout({
    eyebrow: 'Action required',
    heading: escapeHtml(greeting),
    bodyHtml: `<p style="${P}">Congratulations on securing your <strong style="color:#FFFFFF;">GovProposalPro ${edition}</strong> license. Your private command center requires a secure, encrypted login. Please complete your setup now.</p>
      ${button(ACCESS_URL, 'Set Up My Access &rarr;')}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${stepRow(1, 'Initialize your account.', `Open <a href="${ACCESS_URL}" style="color:#7FA2FF;">${ACCESS_URL.replace(/^https:\/\//, '')}</a>.`)}
        ${stepRow(2, 'Create your keys.', 'Use the <strong style="color:#FFFFFF;">same email you used to purchase on Whop</strong> and create a secure password.')}
        ${stepRow(3, 'Tailor your command center.', 'Tell us about your business and experience level. A member of our team will reach out to confirm your access.')}
      </table>
      <p style="${P}">As soon as your login is created, <a href="${LOGIN_URL}" style="color:#7FA2FF;">sign in to your Command Center</a> and start your first bid.</p>
      ${BOOKING_URL ? `<p style="${P}">&#128197; <a href="${BOOKING_URL}" style="color:#7FA2FF;">Book your free onboarding call</a> and we'll walk through your first bid together.</p>` : ''}
      ${tier === 'enterprise' ? `<p style="${P}">As an Enterprise member, your VIP Onboarding Concierge will reach out separately to collect your business details for your Done-For-You SAM.gov registration.</p>` : ''}
      <p style="${P}">&#128196; <a href="${GUIDE_URL}" style="color:#7FA2FF;">Download your setup guide (PDF)</a>. You can also find everything inside Whop under <strong style="color:#FFFFFF;">GovProposalPro Access</strong>.</p>`,
  });
  return { subject, text, html };
}

/** Sent after a buyer completes signup on the access portal. */
function buildWelcomeEmail({ email, tier, firstName = '' }) {
  const edition = editionName(tier);
  const subject = 'Your GovProposalPro access is secured';
  const greeting = firstName ? `Credentials secured, ${firstName}.` : 'Credentials secured.';

  const text = [
    greeting,
    '',
    `Your ${edition} login has been created for ${email}.`,
    'A member of the GovProposalPro team will reach out shortly to confirm your access and walk through your setup.',
    '',
    `Your Command Center is ready. Sign in now with the email and password you just created: ${LOGIN_URL}`,
    BOOKING_URL ? `Book your free onboarding call: ${BOOKING_URL}` : '',
    '',
    `Access portal: ${ACCESS_URL}`,
    `Setup guide (PDF): ${GUIDE_URL}`,
    'Everything is also inside Whop under "GovProposalPro Access".',
    '',
    ...SIGNATURE_TEXT,
  ].join('\n');

  const html = layout({
    eyebrow: 'Access secured',
    heading: escapeHtml(greeting),
    bodyHtml: `<p style="${P}">Your <strong style="color:#FFFFFF;">${edition}</strong> login has been created for <strong style="color:#FFFFFF;">${escapeHtml(email)}</strong>.</p>
      <p style="${P}">A member of the GovProposalPro team will reach out shortly to <strong style="color:#FFFFFF;">confirm your access</strong> and walk through your setup.</p>
      <p style="${P}">Your Command Center is ready. Sign in now with the exact email and password you just created.</p>
      ${button(LOGIN_URL, 'Open My Command Center &rarr;')}
      ${BOOKING_URL ? `<p style="${P}">&#128197; <a href="${BOOKING_URL}" style="color:#7FA2FF;">Book your free onboarding call</a> and we'll walk through your first bid together.</p>` : ''}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${stepRow('&#10003;', 'Account created.', 'Your encrypted login is saved.')}
        ${stepRow('&#10003;', 'Business profile received.', 'We\'ll use it to tailor your workspace.')}
        ${stepRow('&#8594;', 'Next: access confirmation.', 'Watch your phone and inbox for our team.')}
      </table>
      <p style="${P}">&#128196; <a href="${GUIDE_URL}" style="color:#7FA2FF;">Your setup guide (PDF)</a> &middot; <a href="${ACCESS_URL}" style="color:#7FA2FF;">Access portal</a>. Everything is also inside Whop under <strong style="color:#FFFFFF;">GovProposalPro Access</strong>.</p>`,
  });
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

/** Password reset, invite and admin setup links. */
function buildLinkEmail({ eyebrow, heading, intro, href, cta, expires }) {
  const subject = heading;
  const text = `${intro}\n\n${cta}: ${href}\n\nThis link works once and expires in ${expires}. If you did not ask for this, ignore this email.`;
  const html = layout({
    eyebrow,
    heading: escapeHtml(heading),
    bodyHtml: `<p style="${P}">${escapeHtml(intro)}</p>${button(href, escapeHtml(cta))}
      <p style="${P}font-size:13px;color:#8E9AC8;">This link works once and expires in ${escapeHtml(expires)}. If you did not ask for this, you can ignore this email.</p>`,
  });
  return { subject, text, html };
}

/** Deadline reminders. items: [{ title, when, detail }] */
function buildAlertEmail({ heading, intro, items, href }) {
  const subject = heading;
  const text = `${intro}\n\n${items.map((i) => `- ${i.title}: ${i.when}${i.detail ? ` (${i.detail})` : ''}`).join('\n')}\n\n${href}`;
  const rows = items.map((i) => stepRow('&#9200;', escapeHtml(i.title), `<br/><span style="color:#FF8A9A;">${escapeHtml(i.when)}</span>${i.detail ? ` &middot; ${escapeHtml(i.detail)}` : ''}`).replace('&#9200;. ', '&#9200; ')).join('');
  const html = layout({
    eyebrow: 'Deadline alert',
    heading: escapeHtml(heading),
    bodyHtml: `<p style="${P}">${escapeHtml(intro)}</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>${button(href, 'Open your Command Center')}`,
  });
  return { subject, text, html };
}

module.exports = { sendWelcomeEmail, buildWelcomeEmail, buildPurchaseEmail, buildLinkEmail, buildAlertEmail };
