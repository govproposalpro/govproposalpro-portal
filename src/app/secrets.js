'use strict';

/**
 * Encrypts the API keys and mailbox passwords members give the Autopilot (AES-256-GCM).
 * The key comes from KEY_ENCRYPTION_SECRET; without it we derive one from DATABASE_URL so the
 * feature still works, but a dedicated secret is safer because it lives apart from the database.
 * Stored values look like "v1:<source>:<iv>:<tag>:<ciphertext>" so a later key change is detected
 * and the member is asked to re-enter the secret instead of getting garbage.
 */

const crypto = require('crypto');

function keyFor(source) {
  const material = source === 'e' ? process.env.KEY_ENCRYPTION_SECRET : process.env.DATABASE_URL;
  if (!material) return null;
  return Buffer.from(crypto.hkdfSync('sha256', material, 'gpp-autopilot', 'member-secrets-v1', 32));
}
const currentSource = () => (process.env.KEY_ENCRYPTION_SECRET ? 'e' : 'd');

function encrypt(plain) {
  if (!plain) return null;
  const source = currentSource();
  const key = keyFor(source);
  if (!key) throw new Error('No encryption key is configured.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', source, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** Returns the plain text, or null when the value is missing or can no longer be decrypted. */
function decrypt(stored) {
  if (!stored) return null;
  const [v, source, iv, tag, data] = String(stored).split(':');
  if (v !== 'v1') return null;
  const key = keyFor(source);
  if (!key) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** What the browser may see about a stored secret: whether it is set and its last 4 characters. */
function hint(stored) {
  const plain = decrypt(stored);
  if (!plain) return stored ? { set: true, broken: true } : { set: false };
  return { set: true, last4: plain.slice(-4) };
}

module.exports = { encrypt, decrypt, hint };
