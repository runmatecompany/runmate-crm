-- Onboarding-profil: a vállalkozásról szóló tények és a szolgáltatás-
-- terjedelem ("amit vállalunk nekik") — külön az AI-profiltól, ami a
-- kreatív/tartalmi stílus-döntéseket tárolja (megszólítás, hangvétel,
-- célközönség, brand színek — azokat majd utólag, a beszélgetés alapján
-- építjük fel). Az onboarding-hívást lebonyolító kolléga tölti ki élőben,
-- nem admin-only, ellentétben az AI-profillal.
CREATE TABLE IF NOT EXISTS client_onboarding_profiles (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,

    -- Vállalkozás adatai
    industry TEXT,
    business_description TEXT,
    website_url TEXT,
    facebook_url TEXT,
    instagram_url TEXT,
    tiktok_url TEXT,
    youtube_url TEXT,
    brand_assets_location TEXT,

    -- Amit vállalunk nekik (szolgáltatás-terjedelem)
    platform_facebook BOOLEAN NOT NULL DEFAULT false,
    platform_instagram BOOLEAN NOT NULL DEFAULT false,
    platform_tiktok BOOLEAN NOT NULL DEFAULT false,
    platform_youtube BOOLEAN NOT NULL DEFAULT false,
    service_website_build BOOLEAN NOT NULL DEFAULT false,
    service_landing_page BOOLEAN NOT NULL DEFAULT false,
    service_clipping BOOLEAN NOT NULL DEFAULT false,
    clipping_source_folder_url TEXT,
    monthly_video_target INTEGER,
    monthly_post_target INTEGER,

    -- Együttműködés kerete
    collaboration_goals TEXT,
    approval_process_notes TEXT,
    approver_name TEXT,
    approver_email TEXT,
    other_notes TEXT,

    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Meglévő ügyfelek eddig az AI-profilba keveredett onboarding-adatainak
-- átvétele, mielőtt lentebb töröljük az oszlopokat onnan.
INSERT INTO client_onboarding_profiles (
    client_id, website_url, facebook_url, instagram_url, tiktok_url, youtube_url,
    platform_facebook, platform_instagram, platform_tiktok, platform_youtube,
    service_website_build, service_landing_page, service_clipping, clipping_source_folder_url,
    monthly_video_target, monthly_post_target,
    collaboration_goals, approval_process_notes,
    completed_at
)
SELECT
    client_id, website_url, facebook_url, instagram_url, tiktok_url, youtube_url,
    platform_facebook, platform_instagram, platform_tiktok, platform_youtube,
    service_website_build, service_landing_page, service_clipping, clipping_source_folder_url,
    monthly_video_target, monthly_post_target,
    content_goals, approval_process_notes,
    onboarding_completed_at
FROM client_ai_profiles
ON CONFLICT (client_id) DO NOTHING;

-- has_social_presence/inspiration_brands/brand_mission maradnak — ezeket
-- még mindig használja az AI-vázlat-generálás (lib/aiScriptDraft.ts).
-- publishing_cadence sosem lett bekötve sehova, kikerül; content_goals és
-- approval_process_notes átköltözött fentebb, itt már felesleges.
ALTER TABLE client_ai_profiles
    DROP COLUMN IF EXISTS website_url,
    DROP COLUMN IF EXISTS facebook_url,
    DROP COLUMN IF EXISTS instagram_url,
    DROP COLUMN IF EXISTS tiktok_url,
    DROP COLUMN IF EXISTS youtube_url,
    DROP COLUMN IF EXISTS platform_facebook,
    DROP COLUMN IF EXISTS platform_instagram,
    DROP COLUMN IF EXISTS platform_tiktok,
    DROP COLUMN IF EXISTS platform_youtube,
    DROP COLUMN IF EXISTS service_website_build,
    DROP COLUMN IF EXISTS service_landing_page,
    DROP COLUMN IF EXISTS service_clipping,
    DROP COLUMN IF EXISTS clipping_source_folder_url,
    DROP COLUMN IF EXISTS monthly_video_target,
    DROP COLUMN IF EXISTS monthly_post_target,
    DROP COLUMN IF EXISTS onboarding_completed_at,
    DROP COLUMN IF EXISTS content_goals,
    DROP COLUMN IF EXISTS approval_process_notes,
    DROP COLUMN IF EXISTS publishing_cadence;
