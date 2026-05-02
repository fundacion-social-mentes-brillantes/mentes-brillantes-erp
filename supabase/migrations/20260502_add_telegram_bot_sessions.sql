CREATE TABLE IF NOT EXISTS telegram_bot_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'mentes-brillantes',
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  thread_id TEXT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  pending_selection JSONB NULL,
  pending_action JSONB NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_bot_sessions_scope
  ON telegram_bot_sessions (tenant_id, channel, chat_id, user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_bot_sessions_expires_at
  ON telegram_bot_sessions (expires_at);

CREATE OR REPLACE FUNCTION set_telegram_bot_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_telegram_bot_sessions_updated_at ON telegram_bot_sessions;
CREATE TRIGGER trg_telegram_bot_sessions_updated_at
BEFORE UPDATE ON telegram_bot_sessions
FOR EACH ROW
EXECUTE FUNCTION set_telegram_bot_sessions_updated_at();

ALTER TABLE telegram_bot_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS telegram_bot_sessions_service_role_all ON telegram_bot_sessions;
CREATE POLICY telegram_bot_sessions_service_role_all
  ON telegram_bot_sessions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
