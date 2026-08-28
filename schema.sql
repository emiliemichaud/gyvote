-- ============================================================
-- Schéma D1 (SQLite) pour gyvote
-- À exécuter avec : wrangler d1 execute gyvote-db --file=schema.sql
-- ============================================================

-- Note : D1 est SQLite, donc :
--   - UUID générés côté Worker (pas de gen_random_uuid())
--   - timestamptz → TEXT ISO 8601
--   - RLS/GRANT/policies → sécurité assurée par le Worker lui-même

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT    PRIMARY KEY,                        -- UUID généré dans le Worker
  code        TEXT    NOT NULL UNIQUE,
  host_secret TEXT    NOT NULL,                           -- UUID, connu uniquement de l'animateur
  status      TEXT    NOT NULL DEFAULT 'idle'
                      CHECK (status IN ('idle','voting','stopped','results')),
  title       TEXT,                                       -- titre optionnel de la session
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS votes (
  id          TEXT    PRIMARY KEY,                        -- UUID généré dans le Worker
  session_id  TEXT    NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  voter_id    TEXT    NOT NULL,
  choice      TEXT    NOT NULL CHECK (choice IN ('pour','contre','abstention')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  UNIQUE (session_id, voter_id)                           -- un seul vote par personne par session
);

CREATE INDEX IF NOT EXISTS votes_session_idx ON votes(session_id);
CREATE INDEX IF NOT EXISTS sessions_code_idx ON sessions(code);

CREATE TABLE IF NOT EXISTS presence (
  session_id  TEXT NOT NULL,
  voter_id    TEXT NOT NULL,
  last_seen   TEXT NOT NULL,                                -- ISO 8601, mis à jour à chaque heartbeat
  PRIMARY KEY (session_id, voter_id)
);

CREATE INDEX IF NOT EXISTS presence_session_idx ON presence(session_id);
