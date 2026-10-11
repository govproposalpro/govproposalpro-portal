-- GovProposalPro credential portal schema (PostgreSQL 13+)
-- Run once: psql "$DATABASE_URL" -f db/schema.sql

-- Buyers verified as paid on Whop. Only emails in this table can create a login.
-- Filled by the Whop webhook (src/routes/whopWebhook.js) and/or the CSV import script.
CREATE TABLE IF NOT EXISTS authorized_purchasers (
  id            BIGSERIAL PRIMARY KEY,
  email         VARCHAR(254) NOT NULL,
  tier          VARCHAR(20)  CHECK (tier IN ('core', 'enterprise')),
  source        VARCHAR(20)  NOT NULL DEFAULT 'manual',   -- 'webhook' | 'csv' | 'manual'
  whop_ref      VARCHAR(128),                             -- membership / payment id when known
  revoked_at    TIMESTAMPTZ,                              -- set on refund / cancellation
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS authorized_purchasers_email_key
  ON authorized_purchasers (lower(email));

CREATE TABLE IF NOT EXISTS "Users" (
  id                     BIGSERIAL PRIMARY KEY,
  email                  VARCHAR(254) NOT NULL,
  password_hash          CHAR(60)     NOT NULL,           -- bcrypt output is always 60 chars
  tier                   VARCHAR(20)  CHECK (tier IN ('core', 'enterprise')),
  status                 VARCHAR(20)  NOT NULL DEFAULT 'pending_launch',
  welcome_email_sent_at  TIMESTAMPTZ,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness: Jalen@x.com and jalen@x.com are the same account.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON "Users" (lower(email));

-- Business profile captured at signup, used to tailor onboarding and for sales follow-up.
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS full_name        VARCHAR(120);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS phone            VARCHAR(30);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS business_name    VARCHAR(160);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS sam_status       VARCHAR(20);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS annual_revenue   VARCHAR(20);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS primary_goal     VARCHAR(20);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS certifications   VARCHAR(100);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS naics            VARCHAR(200);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS capabilities     VARCHAR(600);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS ghl_contact_id   VARCHAR(64);

-- When the "set up your access" email went out after purchase (sent once per buyer).
ALTER TABLE authorized_purchasers ADD COLUMN IF NOT EXISTS access_email_sent_at TIMESTAMPTZ;
