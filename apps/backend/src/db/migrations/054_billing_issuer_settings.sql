-- A Számlázás modul kibocsátó-adatai + a valódi PDF-számla sorszámozó
-- állapota — egysoros config-tábla, a social_media_config (014) mintájára.
CREATE TABLE IF NOT EXISTS billing_issuer_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    business_name TEXT,
    address TEXT,
    email TEXT,
    iban TEXT,
    sender_account_id INTEGER REFERENCES email_accounts(id),
    next_invoice_number INTEGER NOT NULL DEFAULT 1,
    next_invoice_year INTEGER NOT NULL DEFAULT date_part('year', now())
);
INSERT INTO billing_issuer_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
