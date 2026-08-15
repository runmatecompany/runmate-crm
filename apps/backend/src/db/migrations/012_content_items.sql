CREATE TABLE IF NOT EXISTS content_items (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    title TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('instagram','tiktok','youtube','facebook')),
    status TEXT NOT NULL DEFAULT 'shoot_pending' CHECK (status IN (
      'shoot_pending','shoot_scheduled','script_writing','script_review',
      'shoot_done','editing','edit_review','scheduling','published')),
    shoot_date TIMESTAMPTZ,
    script_content TEXT,
    raw_media_url TEXT,
    edited_media_url TEXT,
    scheduled_publish_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    assigned_to INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_items_client_idx ON content_items (client_id);
CREATE INDEX IF NOT EXISTS content_items_assigned_idx ON content_items (assigned_to);
