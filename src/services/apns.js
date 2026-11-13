'use strict';

/**
 * Apple Push Notification service (APNs) for the GovProposalPro iPhone app (mobile/).
 *
 * Uses Node's built-in http2 and crypto, so there is no extra dependency. It signs a short-lived
 * token (ES256 JWT) with the .p8 key from Apple Developer > Keys, and Apple accepts it for up to an
 * hour. Nothing is sent unless all of these are set on the server:
 *   APNS_KEY      the .p8 file's text (newlines may be written as \n)
 *   APNS_KEY_ID   the 10-character Key ID shown next to the key
 *   APNS_TEAM_ID  the 10-character Team ID (top right of developer.apple.com)
 * Optional: APNS_BUNDLE_ID (default com.govproposalpro.app) and APNS_ENV=sandbox for Xcode debug
 * builds. TestFlight and App Store builds use production, the default.
 */

const crypto = require('crypto');
const http2 = require('http2');
const db = require('../db');

const BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.govproposalpro.app';
const HOST = process.env.APNS_ENV === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
const TOKEN_RE = /^[0-9a-f]{64,200}$/i;

let cachedJwt = null; // { token, at }
let session = null;

function enabled() {
  return Boolean(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function providerToken() {
  // Apple rejects tokens older than an hour and throttles ones refreshed more than every 20 minutes.
  if (cachedJwt && Date.now() - cachedJwt.at < 40 * 60 * 1000) return cachedJwt.token;
  const key = crypto.createPrivateKey(process.env.APNS_KEY.replace(/\\n/g, '\n'));
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }));
  const claims = b64url(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) }));
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  cachedJwt = { token: `${header}.${claims}.${b64url(signature)}`, at: Date.now() };
  return cachedJwt.token;
}

function connection() {
  if (session && !session.closed && !session.destroyed) return session;
  session = http2.connect(HOST);
  session.on('error', (err) => { console.error('[apns] connection error:', err.message); session = null; });
  session.on('goaway', () => { session = null; });
  // Let the process exit and idle connections close on their own.
  session.unref();
  session.setTimeout(5 * 60 * 1000, () => { if (session) session.close(); session = null; });
  return session;
}

/** Sends one notification to one device. Resolves { ok, status, reason }. */
function sendOne(deviceToken, payload) {
  return new Promise((resolve) => {
    let req;
    try {
      req = connection().request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken()}`,
        'apns-topic': BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
    } catch (err) {
      resolve({ ok: false, status: 0, reason: err.message });
      return;
    }
    let status = 0;
    let body = '';
    req.setEncoding('utf8');
    req.setTimeout(15000, () => req.close(http2.constants.NGHTTP2_CANCEL));
    req.on('response', (headers) => { status = headers[':status']; });
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      let reason = '';
      try { reason = body ? JSON.parse(body).reason || '' : ''; } catch { reason = body.slice(0, 100); }
      resolve({ ok: status === 200, status, reason });
    });
    req.on('error', (err) => resolve({ ok: false, status, reason: err.message }));
    req.end(JSON.stringify(payload));
  });
}

/**
 * Sends a notification to every iPhone the member signed in on. `path` is the /app page the
 * notification opens. Resolves the number of devices that accepted it. Never throws.
 */
async function notifyUser(userId, { title, body, path = '/app', badge } = {}) {
  if (!enabled()) return 0;
  try {
    const { rows } = await db.query('SELECT token FROM push_devices WHERE user_id = $1', [userId]);
    if (!rows.length) return 0;
    const payload = {
      aps: { alert: { title: String(title).slice(0, 120), body: String(body || '').slice(0, 300) }, sound: 'default' },
      path: typeof path === 'string' && /^\/app(\/|$)/.test(path) ? path : '/app',
    };
    if (Number.isInteger(badge)) payload.aps.badge = badge;
    let delivered = 0;
    for (const { token } of rows) {
      const r = await sendOne(token, payload);
      if (r.ok) delivered += 1;
      else if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered' || r.reason === 'DeviceTokenNotForTopic') {
        await db.query('DELETE FROM push_devices WHERE token = $1', [token]);
      } else {
        console.error(`[apns] push to user ${userId} failed: ${r.status} ${r.reason}`);
      }
    }
    return delivered;
  } catch (err) {
    console.error(`[apns] push to user ${userId} failed:`, err.message);
    return 0;
  }
}

module.exports = { enabled, notifyUser, TOKEN_RE };
