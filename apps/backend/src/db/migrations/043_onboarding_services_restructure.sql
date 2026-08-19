-- Onboarding szolgáltatás-modell átalakítás: a korábbi, felső szintű
-- platform-jelölők (platform_facebook/instagram/tiktok/youtube) helyett
-- mostantól minden tartalom-típus szolgáltatás (Short videók, Képes
-- posztok, Clippelés) saját, önálló platform-választással rendelkezik —
-- így egy ügyfélnek lehet pl. csak TikTokra videója, de Facebookra posztja.
-- A régi platform_* oszlopok NEM törlődnek (más modul, ContentItemFormModal
-- platform-szűrője még olvassa őket) — az app mostantól a service_short_
-- videos/service_image_posts mentésekor automatikusan újraszámolja őket a
-- három új platform-lista uniójaként (lásd db/clientOnboarding.ts).
--
-- A meglévő monthly_video_target/monthly_post_target oszlopok jelentése
-- mostantól konkrétan a "Short videók" ill. "Képes posztok" szolgáltatás
-- havi mennyisége — nincs szükség új oszlopra ehhez, csak a hozzájuk
-- tartozó explicit szolgáltatás-jelölőre.
ALTER TABLE client_onboarding_profiles
    ADD COLUMN IF NOT EXISTS service_short_videos BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS service_image_posts BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS short_videos_platforms TEXT,
    ADD COLUMN IF NOT EXISTS image_posts_platforms TEXT,
    ADD COLUMN IF NOT EXISTS clipping_platforms TEXT,
    ADD COLUMN IF NOT EXISTS website_pages_count INTEGER,
    ADD COLUMN IF NOT EXISTS website_domain_hosting TEXT,
    ADD COLUMN IF NOT EXISTS website_reference_notes TEXT,
    ADD COLUMN IF NOT EXISTS landing_goal TEXT,
    ADD COLUMN IF NOT EXISTS landing_domain_hosting TEXT,
    ADD COLUMN IF NOT EXISTS landing_reference_notes TEXT;
