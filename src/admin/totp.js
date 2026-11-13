'use strict';

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s): works with Google Authenticator, Authy, 1Password, etc. */

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

const generateSecret = () => base32Encode(crypto.randomBytes(20));

function codeAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/**
 * Checks a code against the current step and one on either side (clock drift). Returns the
 * matching step so the caller can refuse to accept it twice, or null.
 */
function verify(secret, code, lastStep = null, now = Date.now()) {
  // An empty or unreadable secret must never verify: HMAC with an empty key is guessable.
  if (typeof secret !== 'string' || secret.length < 16) return null;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return null;
  const current = Math.floor(now / 1000 / STEP);
  for (const step of [current - 1, current, current + 1]) {
    if (lastStep !== null && step <= Number(lastStep)) continue;
    const expected = codeAt(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code.trim()))) return step;
  }
  return null;
}

const otpauthUrl = (secret, email) =>
  `otpauth://totp/${encodeURIComponent(`GovProposalPro Admin:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('GovProposalPro Admin')}&algorithm=SHA1&digits=6&period=30`;

// Authenticator secrets are encrypted at rest (AES-256-GCM, src/app/secrets.js), so a copy of the
// database alone can't mint admin codes. Secrets saved before this change are plain base32 and
// still read; they are encrypted the next time the admin enrolls.
const secrets = require('../app/secrets');
const storeSecret = (secret) => secrets.encrypt(secret);
const readSecret = (stored) => (typeof stored === 'string' && stored.startsWith('v1:') ? secrets.decrypt(stored) || '' : stored || '');

module.exports = { generateSecret, verify, otpauthUrl, codeAt, storeSecret, readSecret };
