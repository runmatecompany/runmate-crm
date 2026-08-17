ALTER TABLE client_ai_profiles
    ADD COLUMN IF NOT EXISTS monthly_video_target INTEGER,
    ADD COLUMN IF NOT EXISTS monthly_post_target INTEGER;

CREATE TABLE IF NOT EXISTS tasks_access (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
