CREATE TABLE IF NOT EXISTS google_calendar_connection (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    connected_email TEXT,
    refresh_token_enc TEXT,
    sync_token TEXT,
    connected_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ
);
INSERT INTO google_calendar_connection (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS calendar_shoot_events (
    google_event_id TEXT PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    event_start TIMESTAMPTZ NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS next_shoot_date TIMESTAMPTZ;
