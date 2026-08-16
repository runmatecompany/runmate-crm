ALTER TABLE client_ai_profiles
    ADD COLUMN IF NOT EXISTS has_social_presence BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS inspiration_brands TEXT,
    ADD COLUMN IF NOT EXISTS brand_mission TEXT,
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
