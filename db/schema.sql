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

-- ============================================================================
-- GovProposalPro app (dashboard). Same "Users" table, so portal logins carry over.
-- ============================================================================

ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS last_login_at   TIMESTAMPTZ;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS failed_logins   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS locked_until    TIMESTAMPTZ;

-- Server-side sessions. Only the SHA-256 of the cookie token is stored, so a database leak
-- does not hand out live sessions.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash    CHAR(64)     PRIMARY KEY,
  user_id       BIGINT       NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ  NOT NULL,
  ip            VARCHAR(64),
  user_agent    VARCHAR(256)
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

-- Visual Bid CRM: one row per opportunity on the Kanban board.
CREATE TABLE IF NOT EXISTS bids (
  id                   BIGSERIAL    PRIMARY KEY,
  user_id              BIGINT       NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  title                VARCHAR(200) NOT NULL,
  agency               VARCHAR(200),
  solicitation_number  VARCHAR(100),
  naics                VARCHAR(20),
  set_aside            VARCHAR(60),
  place_of_performance VARCHAR(200),
  due_at               DATE,
  est_value            NUMERIC(14, 2),
  stage                VARCHAR(20)  NOT NULL DEFAULT 'prospecting',
  position             INTEGER      NOT NULL DEFAULT 0,
  notes                TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bids_user_stage_idx ON bids (user_id, stage, position);

-- AI Bid Decryptor results. The uploaded RFP itself is never stored, only the summary.
CREATE TABLE IF NOT EXISTS rfp_summaries (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  bid_id       BIGINT       REFERENCES bids(id) ON DELETE SET NULL,
  file_name    VARCHAR(200),
  status       VARCHAR(20)  NOT NULL DEFAULT 'working',   -- working | ready | failed
  summary      JSONB,
  error        VARCHAR(300),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rfp_summaries_user_idx ON rfp_summaries (user_id, created_at DESC);

-- AI Proposal Engine output. Rows that did not fail count toward the monthly cap.
CREATE TABLE IF NOT EXISTS proposals (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        BIGINT       NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  bid_id         BIGINT       REFERENCES bids(id) ON DELETE SET NULL,
  rfp_summary_id BIGINT       REFERENCES rfp_summaries(id) ON DELETE SET NULL,
  title          VARCHAR(200) NOT NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'working',  -- working | ready | failed
  content_md     TEXT,
  error          VARCHAR(300),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS proposals_user_month_idx ON proposals (user_id, created_at DESC);

-- ============================================================================
-- Accounts: password reset / invite tokens, disabled members
-- ============================================================================

-- One-time links: member password reset and invite, admin setup and reset. Only the SHA-256 of
-- the token is stored; a link works once and expires.
CREATE TABLE IF NOT EXISTS password_tokens (
  token_hash    CHAR(64)     PRIMARY KEY,
  kind          VARCHAR(20)  NOT NULL,          -- member_reset | member_invite | admin_setup
  subject_id    BIGINT       NOT NULL,          -- "Users".id or admins.id, by kind
  expires_at    TIMESTAMPTZ  NOT NULL,
  used_at       TIMESTAMPTZ,
  created_by    BIGINT,                         -- admins.id when an admin generated it
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_tokens_subject_idx ON password_tokens (kind, subject_id);

-- ============================================================================
-- Admin dashboard (team and VAs). Separate accounts from members, MFA required.
-- ============================================================================

CREATE TABLE IF NOT EXISTS admins (
  id              BIGSERIAL    PRIMARY KEY,
  email           VARCHAR(254) NOT NULL,
  full_name       VARCHAR(120),
  role            VARCHAR(10)  NOT NULL DEFAULT 'va' CHECK (role IN ('owner', 'va')),
  password_hash   CHAR(60),                     -- null until the setup link is used
  totp_secret     VARCHAR(64),                  -- base32; set on MFA enrollment
  totp_enabled    BOOLEAN      NOT NULL DEFAULT false,
  totp_last_step  BIGINT,                       -- blocks replay of a code within its window
  failed_logins   INTEGER      NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  disabled_at     TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_by      BIGINT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admins_email_key ON admins (lower(email));

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash    CHAR(64)     PRIMARY KEY,
  admin_id      BIGINT       NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  mfa_passed    BOOLEAN      NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ  NOT NULL,
  ip            VARCHAR(64),
  user_agent    VARCHAR(256)
);
CREATE INDEX IF NOT EXISTS admin_sessions_admin_idx ON admin_sessions (admin_id);

-- Every admin action, for accountability.
CREATE TABLE IF NOT EXISTS admin_audit (
  id          BIGSERIAL    PRIMARY KEY,
  admin_id    BIGINT       REFERENCES admins(id) ON DELETE SET NULL,
  action      VARCHAR(60)  NOT NULL,
  target      VARCHAR(254),
  detail      JSONB,
  ip          VARCHAR(64),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit (created_at DESC);

-- ============================================================================
-- Business profile (onboarding) and company documents
-- ============================================================================

ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS uei                 VARCHAR(12);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS cage_code           VARCHAR(5);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS sam_expires_on      DATE;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS website             VARCHAR(200);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS address             VARCHAR(300);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS year_founded        SMALLINT;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS employees           VARCHAR(20);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS service_area        VARCHAR(300);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS differentiators     VARCHAR(2000);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS key_personnel       VARCHAR(4000);
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS past_performance    JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS onboarded_at        TIMESTAMPTZ;
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS sam_checklist       JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS email_alerts        BOOLEAN NOT NULL DEFAULT true;
-- Capabilities grew from a signup one-liner into a full narrative.
ALTER TABLE "Users" ALTER COLUMN capabilities TYPE VARCHAR(4000);

-- Capability statements, past performance write-ups, resumes. The file is not kept: Claude
-- reads it once and the summary is what proposals use.
CREATE TABLE IF NOT EXISTS company_documents (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  file_name    VARCHAR(200) NOT NULL,
  kind         VARCHAR(30)  NOT NULL DEFAULT 'other',
  status       VARCHAR(20)  NOT NULL DEFAULT 'working',  -- working | ready | failed
  summary      TEXT,
  extracted    JSONB,                                    -- profile fields found in the document
  error        VARCHAR(300),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_documents_user_idx ON company_documents (user_id, created_at DESC);

-- ============================================================================
-- Extras: capability statements, deadline alerts, subcontractor vetting
-- ============================================================================

CREATE TABLE IF NOT EXISTS capability_statements (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  status       VARCHAR(20)  NOT NULL DEFAULT 'working',
  content_md   TEXT,
  error        VARCHAR(300),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS capability_statements_user_idx ON capability_statements (user_id, created_at DESC);

ALTER TABLE bids ADD COLUMN IF NOT EXISTS questions_due_at DATE;

-- One row per reminder sent, so each one goes out exactly once.
CREATE TABLE IF NOT EXISTS alert_log (
  user_id     BIGINT       NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  alert_key   VARCHAR(80)  NOT NULL,          -- e.g. bid:12:due:3
  sent_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alert_key)
);

-- Sub-Safe vetting: SAM.gov registration and exclusion checks, kept as evidence.
CREATE TABLE IF NOT EXISTS sub_vettings (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES "Users"(id) ON DELETE CASCADE,
  query        VARCHAR(200) NOT NULL,
  verdict      VARCHAR(20)  NOT NULL,          -- clear | excluded | not_registered | review
  result       JSONB        NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sub_vettings_user_idx ON sub_vettings (user_id, created_at DESC);
ALTER TABLE company_documents     ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE capability_statements ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
