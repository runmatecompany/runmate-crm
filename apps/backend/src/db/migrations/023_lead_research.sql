ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Append-only napló: minden kutatás-futás egy új sor, hogy összehasonlítható
-- legyen két futás között, mi változott.
CREATE TABLE IF NOT EXISTS lead_research (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'awaiting_input', 'done', 'error')),
    website_analysis TEXT,
    social_findings TEXT,
    social_manual_notes TEXT,
    call_hook TEXT,
    call_script TEXT,
    full_audit TEXT,
    outcome TEXT,
    outcome_notes TEXT,
    error_message TEXT,
    requested_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);
