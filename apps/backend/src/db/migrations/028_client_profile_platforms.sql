-- Az onboarding-kérdőív platform-választójához (Facebook/Instagram/TikTok/
-- YouTube egyesével kijelölhető) és a weboldal-mezőhöz.
ALTER TABLE client_ai_profiles
    ADD COLUMN IF NOT EXISTS platform_facebook BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS platform_instagram BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS platform_tiktok BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS platform_youtube BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS website_url TEXT;
