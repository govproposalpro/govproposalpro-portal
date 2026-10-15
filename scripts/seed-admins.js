'use strict';

// npm run admin:seed            create any missing team admin accounts (also runs on every deploy)
// npm run admin:link -- <email> print a fresh admin setup link (password + authenticator reset)
require('dotenv').config();
const db = require('../src/db');
const tokens = require('../src/tokens');
const { seedAdmins } = require('../src/admin/seed');

async function main() {
  const i = process.argv.indexOf('--link');
  if (i === -1) return seedAdmins();
  const email = (process.argv[i + 1] || '').toLowerCase();
  const { rows } = await db.query('SELECT id FROM admins WHERE lower(email) = $1', [email]);
  if (!rows[0]) throw new Error(`No admin with email ${email}`);
  console.log((await tokens.issue('admin_setup', rows[0].id)).url);
}

main()
  .catch((err) => { console.error('[admin]', err.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
