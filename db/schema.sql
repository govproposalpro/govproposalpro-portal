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
