CREATE TABLE IF NOT EXISTS poi_discovery_candidates (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  node_id TEXT NOT NULL REFERENCES tourism_nodes(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  longitude REAL,
  latitude REAL,
  distance_m INTEGER,
  source_payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','rejected','imported')),
  mapped_category TEXT NOT NULL DEFAULT '',
  description_draft TEXT NOT NULL DEFAULT '',
  review_note TEXT NOT NULL DEFAULT '',
  reviewer_user_id TEXT,
  imported_poi_id TEXT REFERENCES pois(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  reviewed_at BIGINT,
  UNIQUE(provider, provider_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_poi_candidates_status_node ON poi_discovery_candidates(status,node_id,updated_at);

CREATE TABLE IF NOT EXISTS media_audit_log (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL REFERENCES media_assets(id),
  action TEXT NOT NULL,
  actor_user_id TEXT,
  before_json TEXT,
  after_json TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_audit_media_time ON media_audit_log(media_id,created_at);

CREATE TABLE IF NOT EXISTS integration_verifications (
  id TEXT PRIMARY KEY,
  integration TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('passed','failed','blocked')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  latency_ms INTEGER,
  actor_user_id TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_integration_verify_kind_time ON integration_verifications(integration,created_at);

CREATE TABLE IF NOT EXISTS sms_delivery_challenges (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  phone_mask TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_challenge_phone ON sms_delivery_challenges(phone_hash,created_at);
