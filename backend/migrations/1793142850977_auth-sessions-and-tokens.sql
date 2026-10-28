-- Up Migration

-- Authentication: email verification, server-side sessions, one-time tokens and outgoing email.
-- Session and token values are random 32-byte secrets held only by the browser or in an email;
-- the database keeps their SHA-256 hashes, so a database leak can't be replayed as a login.

ALTER TABLE users ADD COLUMN email_verified_at timestamptz;

-- Sessions ------------------------------------------------------------------------------------

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Refreshed as the session is used; idle sessions expire
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- Absolute limit, however active the session is
  expires_at timestamptz NOT NULL,
  CONSTRAINT sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT sessions_token_hash_length CHECK (octet_length(token_hash) = 32),
  CONSTRAINT sessions_expiry_after_creation CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
-- Clearing out expired sessions
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);

-- One-time tokens for email verification and password reset -----------------------------------

CREATE TABLE auth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose text NOT NULL,
  token_hash bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  -- Set when the token is redeemed or superseded; a token works once
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_tokens_token_hash_key UNIQUE (token_hash),
  CONSTRAINT auth_tokens_token_hash_length CHECK (octet_length(token_hash) = 32),
  CONSTRAINT auth_tokens_purpose_valid CHECK (purpose IN ('email_verification', 'password_reset')),
  CONSTRAINT auth_tokens_expiry_after_creation CHECK (expires_at > created_at)
);

-- Finding a user's outstanding tokens of one kind, to retire them
CREATE INDEX auth_tokens_user_purpose_idx ON auth_tokens (user_id, purpose) WHERE used_at IS NULL;

-- Outgoing email ------------------------------------------------------------------------------

-- Written in the same transaction as the change that triggers it. A delivery worker sends unsent
-- rows; until one exists, `npm run mail:outbox` shows them in development.
CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address text NOT NULL,
  template text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT email_outbox_template_valid CHECK (template IN ('email_verification', 'password_reset'))
);

CREATE INDEX email_outbox_unsent_idx ON email_outbox (created_at) WHERE sent_at IS NULL;

-- Down Migration

DROP TABLE email_outbox;
DROP TABLE auth_tokens;
DROP TABLE sessions;
ALTER TABLE users DROP COLUMN email_verified_at;
