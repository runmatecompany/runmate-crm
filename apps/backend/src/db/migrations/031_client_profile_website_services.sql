-- Szolgáltatás-választó bővítése: a social media platformok mellett
-- weboldal/landing oldal készítés is választható szolgáltatásként.
ALTER TABLE client_ai_profiles
    ADD COLUMN IF NOT EXISTS service_website_build BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS service_landing_page BOOLEAN NOT NULL DEFAULT false;
