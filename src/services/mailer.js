'use strict';

/**
 * Sends one transactional email (password resets, setup links, deadline alerts) to any address.
 * Uses GoHighLevel when it is configured (the contact is upserted first, since GHL emails go to
 * contacts), otherwise SMTP. Throws when neither is set up so callers can fall back to a link.
 */

const nodemailer = require('nodemailer');
const ghl = require('./ghl');

let transporter = null;
function smtp() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      requireTLS: process.env.SMTP_SECURE !== 'true',
    });
  }
  return transporter;
}

function canSend() {
  return ghl.enabled() || Boolean(process.env.SMTP_HOST);
}

/** @param {{ to: string, subject: string, html: string, text?: string, contactId?: string, tags?: string[] }} msg */
async function send({ to, subject, html, text, contactId, tags }) {
  if (ghl.enabled()) {
    const id = contactId || (await ghl.upsertContact({ email: to, tags }));
    await ghl.sendEmail(id, { subject, html });
    return;
  }
  if (process.env.SMTP_HOST) {
    await smtp().sendMail({ from: process.env.EMAIL_FROM, replyTo: process.env.EMAIL_REPLY_TO || undefined, to, subject, text, html });
    return;
  }
  throw new Error('No email provider is configured');
}

module.exports = { send, canSend };
