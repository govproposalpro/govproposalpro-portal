'use strict';

/**
 * Makes sure the team's admin accounts exist (runs on every deploy; safe to repeat).
 * - Owners (ADMIN_OWNER_EMAILS): on first creation they are emailed a setup link. If email is
 *   not configured the link is printed to the deploy log, which only Render account holders see.
 * - VAs (ADMIN_VA_EMAILS): created without a password; an owner sends each VA their setup link
 *   from Admin -> Team.
 * Prints a fresh setup link for one admin on demand: npm run admin:link -- someone@x.com (Render Shell)
 */

const db = require('../db');
const tokens = require('../tokens');
const mailer = require('../services/mailer');
const { buildLinkEmail } = require('../services/email');

const list = (v, fallback) => (v === undefined ? fallback : v).split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const OWNERS = list(process.env.ADMIN_OWNER_EMAILS, 'jalen@contractbros.com,kinno@contractbros.com');
const VAS = list(process.env.ADMIN_VA_EMAILS, 'va1@govproposalpro.com,va2@govproposalpro.com,va3@govproposalpro.com,va4@govproposalpro.com,va5@govproposalpro.com');
const NAMES = { 'jalen@contractbros.com': 'Jalen', 'kinno@contractbros.com': 'Kinno' };

async function setupLink(admin) {
  const link = await tokens.issue('admin_setup', admin.id);
  if (mailer.canSend()) {
    try {
      await mailer.send({
        to: admin.email,
        tags: ['gpp-staff'],
        ...buildLinkEmail({
          eyebrow: 'Team access',
          heading: 'Set up your GovProposalPro admin login',
          intro: 'Your owner account for the GovProposalPro admin dashboard is ready. Create your password, then scan the QR code with an authenticator app to finish two-step sign-in.',
          href: link.url,
          cta: 'Set up my admin login',
          expires: tokens.expiresLabel(link.expiresMinutes),
        }),
      });
      console.log(`[seed-admins] setup link emailed to ${admin.email}`);
      return;
    } catch (err) {
      console.error(`[seed-admins] email to ${admin.email} failed: ${err.message}`);
    }
  }
  console.log(`[seed-admins] setup link for ${admin.email} (expires in ${tokens.expiresLabel(link.expiresMinutes)}): ${link.url}`);
}

async function main() {
  for (const [emails, role] of [[OWNERS, 'owner'], [VAS, 'va']]) {
    for (const [n, email] of emails.entries()) {
      const name = NAMES[email] || (role === 'va' ? `VA ${n + 1}` : null);
      const { rows } = await db.query(
        `INSERT INTO admins (email, full_name, role) VALUES ($1, $2, $3)
         ON CONFLICT ((lower(email))) DO NOTHING RETURNING id, email`, [email, name, role]);
      if (rows[0]) {
        console.log(`[seed-admins] created ${role} ${email}`);
        if (role === 'owner') await setupLink(rows[0]);
      }
    }
  }
}

module.exports = { seedAdmins: main };
