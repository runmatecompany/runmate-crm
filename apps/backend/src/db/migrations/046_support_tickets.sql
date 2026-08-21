-- Belső support/hibajelentő csatorna: bárki beküldhet egy szöveges
-- jelzést (hiba, hiányosság, funkciókérés), a "support" modulban pedig
-- (jogosultsággal rendelkezők, admin mindig) listázva látszik, ki és
-- mikor küldte, és nyitva/megoldva állapotra váltható.
CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, created_at);

CREATE TABLE IF NOT EXISTS support_access (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
