-- A lead-kutatásnál rögzített social media linkek (meglévő jelenlét) is
-- átkerülnek ide ügyféllé alakításkor — ne kelljen újra megkérdezni.
ALTER TABLE client_ai_profiles
    ADD COLUMN IF NOT EXISTS facebook_url TEXT,
    ADD COLUMN IF NOT EXISTS instagram_url TEXT,
    ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
    ADD COLUMN IF NOT EXISTS youtube_url TEXT;
