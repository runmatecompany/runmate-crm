-- Lead Gen — telefon-első B2B leadvadász modul, teljesen önálló a meglévő
-- "Leadek" (leads) modultól: más adatmodell (cégadat-dúsítás, pontozás,
-- diszpozíciós hívásnapló), más célra (hideg megkeresés forrás-oldala,
-- nem a már felvett leadek kézi nyomon követése).

CREATE TABLE IF NOT EXISTS leadgen_access (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leadgen_companies (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    tax_number TEXT,
    company_registration_number TEXT,
    company_type TEXT,
    address TEXT,
    city TEXT,
    county TEXT,
    industry TEXT,
    main_activity TEXT,

    website TEXT,
    website_status TEXT,
    website_mobile_friendly BOOLEAN,
    website_title TEXT,

    phone_main TEXT,
    phone_source TEXT,
    phone_type TEXT CHECK (phone_type IS NULL OR phone_type IN ('direct_dm', 'central', 'contact_form')),
    phone_verified BOOLEAN NOT NULL DEFAULT false,

    revenue_current NUMERIC,
    revenue_previous NUMERIC,
    revenue_year INTEGER,
    revenue_source TEXT,
    revenue_source_url TEXT,
    revenue_verified BOOLEAN NOT NULL DEFAULT false,
    revenue_verified_at TIMESTAMPTZ,

    employee_count INTEGER,
    employee_count_confidence TEXT CHECK (employee_count_confidence IS NULL OR employee_count_confidence IN ('high', 'medium', 'low')),

    social_assessment TEXT CHECK (social_assessment IS NULL OR social_assessment IN ('active_good', 'active_weak', 'stale', 'very_weak', 'none')),
    ad_running BOOLEAN NOT NULL DEFAULT false,

    lead_score INTEGER NOT NULL DEFAULT 0,
    lead_score_breakdown TEXT,
    lead_temperature TEXT NOT NULL DEFAULT 'low_priority'
        CHECK (lead_temperature IN ('hot', 'warm', 'potential', 'low_priority')),

    lead_status TEXT NOT NULL DEFAULT 'new'
        CHECK (lead_status IN ('new', 'qualified', 'calling', 'callback', 'interested', 'meeting_booked', 'won', 'nurture', 'lost')),
    call_attempts_count INTEGER NOT NULL DEFAULT 0,
    last_call_at TIMESTAMPTZ,
    next_call_at TIMESTAMPTZ,
    best_call_window TEXT,

    do_not_call BOOLEAN NOT NULL DEFAULT false,
    do_not_call_reason TEXT,
    do_not_call_at TIMESTAMPTZ,

    seed_source TEXT CHECK (seed_source IS NULL OR seed_source IN ('csv', 'maps', 'ad_library', 'catalog', 'manual')),
    seed_source_note TEXT,

    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS leadgen_companies_status_idx ON leadgen_companies (lead_status);
CREATE INDEX IF NOT EXISTS leadgen_companies_tax_number_idx ON leadgen_companies (tax_number);
CREATE INDEX IF NOT EXISTS leadgen_companies_next_call_idx ON leadgen_companies (next_call_at);

CREATE TABLE IF NOT EXISTS leadgen_contacts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES leadgen_companies(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    position TEXT,
    role_type TEXT,
    phone TEXT,
    phone_extension TEXT,
    email TEXT,
    linkedin_url TEXT,
    source TEXT,
    source_url TEXT,
    confidence TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
    verified BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leadgen_contacts_company_idx ON leadgen_contacts (company_id);

-- Minden hívási kísérlet — a modul lényege. A gdpr_notice_given NOT NULL
-- DEFAULT false, de a route-szinten kötelezővé tesszük true-ra állítani
-- lezáráskor (nem adatbázis-szintű kényszer, mert a DEFAULT false-t kell
-- tudni beszúrni a form beküldése előtti pillanatban is, ha valaha
-- draft-mentés kellene — most nincs ilyen, de nem szorítjuk be feleslegesen).
CREATE TABLE IF NOT EXISTS leadgen_call_attempts (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES leadgen_companies(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES leadgen_contacts(id) ON DELETE SET NULL,
    called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    called_by INTEGER REFERENCES users(id),
    disposition TEXT NOT NULL CHECK (disposition IN (
        'no_answer', 'busy', 'wrong_number', 'gatekeeper_blocked', 'gatekeeper_passed',
        'dm_unavailable', 'callback_requested', 'not_interested', 'interested',
        'meeting_booked', 'do_not_call'
    )),
    gatekeeper_name TEXT,
    reached_person TEXT,
    duration_seconds INTEGER,
    notes TEXT,
    next_action TEXT,
    next_call_at TIMESTAMPTZ,
    gdpr_notice_given BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS leadgen_call_attempts_company_idx ON leadgen_call_attempts (company_id, called_at);

-- Singleton beállítás-sor (ugyanaz a minta, mint social_media_config) — az
-- érdekmérlegelési teszt szövegének verziózott tárolása, a GDPR jogos
-- érdek jogalap megvédéséhez.
CREATE TABLE IF NOT EXISTS leadgen_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    interest_balancing_test_text TEXT,
    interest_balancing_test_version INTEGER NOT NULL DEFAULT 0,
    interest_balancing_test_updated_at TIMESTAMPTZ
);
INSERT INTO leadgen_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
