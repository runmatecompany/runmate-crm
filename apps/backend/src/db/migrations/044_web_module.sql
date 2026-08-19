-- Web modul: weboldal és landing oldal projektek egy közös Kanban-
-- táblában (a project_type különbözteti meg őket, nem külön tábla) —
-- ugyanaz az elv, mint a manual_tasks-nál: state machine + esemény-
-- napló, hogy lássuk ki hozta létre / kire van kiosztva / ki mozdította
-- utoljára.
CREATE TABLE IF NOT EXISTS web_access (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS web_projects (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    project_type TEXT NOT NULL CHECK (project_type IN ('website', 'landing_page')),
    status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'development', 'review', 'live')),
    live_url TEXT,
    notes TEXT,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_projects_client_idx ON web_projects (client_id);
CREATE INDEX IF NOT EXISTS web_projects_status_idx ON web_projects (status);

CREATE TABLE IF NOT EXISTS web_project_events (
    id SERIAL PRIMARY KEY,
    web_project_id INTEGER NOT NULL REFERENCES web_projects(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    user_name TEXT,
    from_status TEXT,
    to_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_project_events_project_idx ON web_project_events (web_project_id, created_at);
