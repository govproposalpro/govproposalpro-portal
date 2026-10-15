'use strict';

// Applies db/schema.sql (idempotent: every statement uses IF NOT EXISTS), then makes sure the
// team's admin accounts exist. Runs on each deploy.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

const { seedAdmins } = require('../src/admin/seed');

pool
  .query(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'))
  .then(() => console.log('Schema is up to date.'))
  .then(() => seedAdmins())
  .catch((err) => { console.error('Migration failed:', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
