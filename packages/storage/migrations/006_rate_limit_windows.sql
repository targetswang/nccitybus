-- Shared rate-limit windows so API replicas enforce one limit per client IP
-- instead of per-process counters. The API keeps a local cache in front of
-- this table; housekeeping() purges windows older than ten minutes.
CREATE TABLE IF NOT EXISTS rate_limit_windows (
  ip TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  count BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, window_start)
);
