CREATE TABLE IF NOT EXISTS ai_tasks (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_redacted TEXT NOT NULL,
  status TEXT NOT NULL,
  response_text TEXT NOT NULL DEFAULT '',
  tool_trace_json TEXT NOT NULL DEFAULT '[]',
  error_text TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  completed_at BIGINT
);
CREATE TABLE IF NOT EXISTS ai_proposals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES ai_tasks(id),
  actor_user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  record_id TEXT,
  expected_revision INTEGER,
  before_json TEXT,
  patch_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  saved_record_id TEXT,
  created_at BIGINT NOT NULL,
  applied_at BIGINT
);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_actor_time ON ai_tasks(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_proposals_actor_status ON ai_proposals(actor_user_id, status);
