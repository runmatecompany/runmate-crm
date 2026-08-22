-- Számlázási adatok az ügyfélhez (ha a bejövő ügyfél céges adatai eltérnek
-- az egyszerű cégnévtől/címtől), és több kapcsolattartó kezelése — a
-- meglévő clients.contact_name/phone/email marad az elsődleges
-- kapcsolattartó, ez a tábla a további kapcsolattartókhoz.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_number TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS billing_address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS bank_account TEXT;

CREATE TABLE IF NOT EXISTS client_contacts (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_contacts_client_idx ON client_contacts (client_id);
