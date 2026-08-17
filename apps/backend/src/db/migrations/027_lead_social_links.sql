-- Kutatási kérdőív: platformonkénti link-mezők a leadhez. Nem kötelező
-- kutatás-futtatáshoz kötve — bármikor kitölthető. "-" a mezőben azt
-- jelenti, hogy a kolléga ellenőrizte és nincs ilyen platformja a leadnek
-- (ezt a UI/kód nem értelmezi speciálisan, csak szöveges jelzés).
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS facebook_url TEXT,
    ADD COLUMN IF NOT EXISTS instagram_url TEXT,
    ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
    ADD COLUMN IF NOT EXISTS youtube_url TEXT;
