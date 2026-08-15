CREATE TABLE IF NOT EXISTS social_media_access (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_media_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    sender_account_id INTEGER REFERENCES email_accounts(id)
);
INSERT INTO social_media_config (id) VALUES (1) ON CONFLICT DO NOTHING;
