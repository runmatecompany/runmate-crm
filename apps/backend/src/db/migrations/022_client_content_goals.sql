ALTER TABLE client_ai_profiles
    ADD COLUMN IF NOT EXISTS content_goals TEXT,
    ADD COLUMN IF NOT EXISTS publishing_cadence TEXT,
    ADD COLUMN IF NOT EXISTS approval_process_notes TEXT;
