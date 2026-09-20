-- Unified user/account/RBAC/content model. PostgreSQL and SQLite compatible subset.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone_hash TEXT UNIQUE,
  phone_mask TEXT,
  nickname TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','closed')),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('phone','wechat_openid','wechat_unionid')),
  provider_key TEXT NOT NULL,
  verified_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE(kind, provider_key)
);
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  audience TEXT NOT NULL CHECK (audience IN ('user','admin')),
  role TEXT NOT NULL,
  client_type TEXT NOT NULL,
  auth_method TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_challenges (
  id TEXT PRIMARY KEY,
  phone_hash TEXT NOT NULL,
  phone_mask TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('user','admin')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS staff_roles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('admin','publisher','operator','customer_service','viewer')),
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id TEXT NOT NULL REFERENCES users(id),
  poi_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(user_id, poi_id)
);
CREATE TABLE IF NOT EXISTS membership_instances (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan_id TEXT NOT NULL,
  title TEXT NOT NULL,
  terms_snapshot TEXT NOT NULL,
  status TEXT NOT NULL,
  joined_at BIGINT NOT NULL,
  expires_at BIGINT,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, plan_id)
);
CREATE TABLE IF NOT EXISTS benefit_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  benefit_id TEXT NOT NULL,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  terms_snapshot TEXT NOT NULL,
  fulfillment_snapshot TEXT NOT NULL,
  status TEXT NOT NULL,
  claimed_at BIGINT NOT NULL,
  expires_at BIGINT,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, benefit_id)
);
CREATE TABLE IF NOT EXISTS event_registrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  event_id TEXT NOT NULL,
  title TEXT NOT NULL,
  rules_snapshot TEXT NOT NULL,
  status TEXT NOT NULL,
  registered_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  UNIQUE(user_id, event_id)
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('ticket','privacy')),
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  public_reply TEXT NOT NULL DEFAULT '',
  internal_note TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS inbox_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  read_at BIGINT,
  created_at BIGINT NOT NULL
);

-- Normalized tourism/content tables. payload_json keeps the complete source object losslessly.
CREATE TABLE IF NOT EXISTS tourism_routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS tourism_nodes (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL REFERENCES tourism_routes(id),
  name TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT '',
  sequence INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  source_url TEXT,
  storage_path TEXT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  rights_status TEXT NOT NULL DEFAULT 'inherited_unverified',
  match_status TEXT NOT NULL DEFAULT 'inherited_unverified',
  evidence TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS pois (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES tourism_nodes(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  cover_media_id TEXT REFERENCES media_assets(id),
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS city_walks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  cover_poi_id TEXT REFERENCES pois(id),
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS city_walk_steps (
  walk_id TEXT NOT NULL REFERENCES city_walks(id),
  sequence INTEGER NOT NULL,
  poi_id TEXT NOT NULL REFERENCES pois(id),
  title TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(walk_id, sequence)
);
CREATE TABLE IF NOT EXISTS home_config (
  singleton INTEGER PRIMARY KEY CHECK (singleton=1),
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS banners (
  id TEXT PRIMARY KEY,
  placement TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  sort_order INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS membership_plans (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS benefits (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  payload_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS content_edit_history (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  business_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  actor_user_id TEXT,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_unified_session_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_unified_session_expiry ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_identity_user ON user_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_user ON support_tickets(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_user ON inbox_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_poi_node ON pois(node_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_walk_step_poi ON city_walk_steps(poi_id);
CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event TEXT NOT NULL,
  client TEXT NOT NULL,
  page TEXT NOT NULL DEFAULT '',
  object_type TEXT NOT NULL DEFAULT '',
  object_id TEXT NOT NULL DEFAULT '',
  channel_code TEXT NOT NULL DEFAULT '',
  content_version TEXT NOT NULL DEFAULT '',
  properties_json TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_event_time ON analytics_events(event, created_at);
