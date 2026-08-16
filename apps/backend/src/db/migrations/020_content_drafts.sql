CREATE TABLE IF NOT EXISTS content_drafts (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('script', 'caption', 'image_concept', 'carousel')),
    platform TEXT NOT NULL,
    title TEXT NOT NULL,
    topic TEXT,
    content_text TEXT,
    drive_file_id TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
