-- Run this once in the Supabase SQL editor to create the approved_emails table.
-- Only emails listed here can log in; Bikram (admin) adds rows manually.

CREATE TABLE IF NOT EXISTS approved_emails (
  email     TEXT        PRIMARY KEY,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: only authenticated users (who just verified OTP) can check their own approval.
ALTER TABLE approved_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read approved_emails"
  ON approved_emails
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "service role full access"
  ON approved_emails
  FOR ALL
  TO service_role
  USING (true);

-- Add the admin email to grant yourself access first:
-- INSERT INTO approved_emails (email) VALUES ('bikram@example.com');
