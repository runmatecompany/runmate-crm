-- Belső számla-nyilvántartó (nem hivatalos számlakibocsátó — a tényleges
-- számlát külső programban állítják ki, ez csak nyilvántartja, hogy melyik
-- ügyfélnek mennyit, miért, mikor számláztak, és kifizették-e). Admin-only
-- modul, az Admin főmodul alá kerül, nincs saját <module>_access tábla.
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount NUMERIC(10,2) NOT NULL,
    invoice_number TEXT,
    issue_date DATE NOT NULL,
    due_date DATE,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
    paid_at TIMESTAMPTZ,
    drive_link TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_client_idx ON invoices (client_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);
