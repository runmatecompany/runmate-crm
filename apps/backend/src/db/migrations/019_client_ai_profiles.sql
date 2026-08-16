CREATE TABLE IF NOT EXISTS client_ai_profiles (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
    brand_voice TEXT,
    target_audience TEXT,
    visual_direction TEXT,
    forbidden_topics TEXT,
    cta_style TEXT,
    platform_notes TEXT,
    reference_links TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
