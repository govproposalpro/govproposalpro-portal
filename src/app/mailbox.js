'use strict';

/**
 * The member's own mailbox, for the Autopilot's quote requests to vendors: sends through their
 * SMTP server (so replies come back to them) and reads vendor replies over IMAP. Credentials are
 * stored encrypted and only decrypted for the length of one run.
 */

const dns = require('dns').promises;
const net = require('net');
const nodemailer = require('nodemailer');

const SMTP_PORTS = [465, 587, 2525, 25];
const IMAP_PORTS = [993];

// Known providers, so most members only type their email and an app password.
const PRESETS = [
  { match: /@(gmail|googlemail)\.com$/i, smtp: 'smtp.gmail.com', smtpPort: 465, imap: 'imap.gmail.com' },
  { match: /@(outlook|hotmail|live|msn)\.com$/i, smtp: 'smtp-mail.outlook.com', smtpPort: 587, imap: 'outlook.office365.com' },
  { match: /@(yahoo|ymail)\.com$/i, smtp: 'smtp.mail.yahoo.com', smtpPort: 465, imap: 'imap.mail.yahoo.com' },
  { match: /@(icloud|me|mac)\.com$/i, smtp: 'smtp.mail.me.com', smtpPort: 587, imap: 'imap.mail.me.com' },
  { match: /@(zoho)\.com$/i, smtp: 'smtp.zoho.com', smtpPort: 465, imap: 'imap.zoho.com' },
];
function preset(email) {
  return PRESETS.find((p) => p.match.test(String(email || ''))) || null;
}

class MailboxError extends Error {}

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80')
    || (v6.startsWith('::ffff:') && privateAddress(v6.slice(7)));
}

/** Refuses hosts that resolve into our own network, so a mailbox setting can't be used to probe it. */
async function publicHost(host) {
  if (!/^[a-z0-9.-]{3,200}$/i.test(String(host || ''))) throw new MailboxError('Enter a valid mail server name, like smtp.gmail.com.');
  if (process.env.MAILBOX_ALLOW_PRIVATE === '1') return host;
  let addrs;
  try { addrs = await dns.lookup(host, { all: true }); } catch { throw new MailboxError(`We could not find the mail server ${host}.`); }
  if (!addrs.length || addrs.some((a) => privateAddress(a.address))) throw new MailboxError(`${host} is not a public mail server.`);
  return host;
}

/** @param {{ host, port, user, pass, fromName }} box */
async function transport(box) {
  const port = Number(box.port) || 465;
  if (!SMTP_PORTS.includes(port)) throw new MailboxError('Use SMTP port 465 or 587.');
  return nodemailer.createTransport({
    host: await publicHost(box.host),
    port,
    secure: port === 465,
    requireTLS: port !== 465 && process.env.MAILBOX_ALLOW_PRIVATE !== '1',
    auth: { user: box.user, pass: box.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Signs in to SMTP without sending anything. */
async function verify(box) {
  const t = await transport(box);
  try {
    await t.verify();
  } catch (err) {
    throw new MailboxError(/auth|535|534|login|credentials/i.test(err.message)
      ? 'Your email provider rejected the sign-in. Use an app password (Gmail, Outlook and Yahoo require one).'
      : `We could not reach your mail server: ${String(err.message).slice(0, 120)}`);
  } finally {
    t.close();
  }
}

async function send(box, { to, subject, text, replyTo }) {
  const t = await transport(box);
  try {
    const info = await t.sendMail({
      from: { name: box.fromName || box.user, address: box.user },
      to,
      subject,
      text,
      replyTo: replyTo || box.user,
    });
    return info.messageId;
  } finally {
    t.close();
  }
}

/**
 * Replies in the inbox whose subject carries one of our quote tags, from the last two weeks.
 * @returns {Promise<{ tag: string, from: string, subject: string, text: string, date: Date }[]>}
 */
async function readReplies(box, tagPattern) {
  const { ImapFlow } = require('imapflow');
  const { simpleParser } = require('mailparser');
  const port = Number(box.imapPort) || 993;
  if (!IMAP_PORTS.includes(port)) throw new MailboxError('Use IMAP port 993.');
  const client = new ImapFlow({
    host: await publicHost(box.imapHost),
    port,
    secure: true,
    auth: { user: box.user, pass: box.pass },
    logger: false,
    socketTimeout: 30_000,
    tls: process.env.MAILBOX_ALLOW_PRIVATE === '1' ? { rejectUnauthorized: false } : undefined,
  });
  const found = [];
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const since = new Date(Date.now() - 14 * 86400000);
      const uids = await client.search({ since, subject: 'GPP-Q' }, { uid: true });
      for (const uid of (uids || []).slice(-60)) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source || msg.source.length > 2_000_000) continue;
        const parsed = await simpleParser(msg.source);
        const m = String(parsed.subject || '').match(tagPattern);
        if (!m) continue;
        found.push({
          tag: m[1],
          from: (parsed.from && parsed.from.value[0] && parsed.from.value[0].address) || '',
          subject: String(parsed.subject || '').slice(0, 300),
          text: String(parsed.text || '').slice(0, 20000),
          date: parsed.date || new Date(),
        });
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    if (err instanceof MailboxError) throw err;
    throw new MailboxError(/auth/i.test(String(err.message) + String(err.responseText || ''))
      ? 'Your email provider rejected the inbox sign-in. Check the app password.'
      : 'We could not read your inbox right now.');
  } finally {
    await client.logout().catch(() => {});
  }
  return found;
}

module.exports = { preset, verify, send, readReplies, MailboxError, PRESETS };
