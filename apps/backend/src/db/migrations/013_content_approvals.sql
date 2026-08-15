CREATE TABLE IF NOT EXISTS content_approvals (
    id SERIAL PRIMARY KEY,
    content_item_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('script','edit')),
    version INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_expires_at TIMESTAMPTZ NOT NULL,
    snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    decided_at TIMESTAMPTZ,
    decided_by_name TEXT,
    feedback TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_approvals_item_idx ON content_approvals (content_item_id);
