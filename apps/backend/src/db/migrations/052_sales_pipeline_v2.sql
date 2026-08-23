-- Értékesítés pipeline v2: szigorúbb, lépésenként csak a releváns adatokat
-- mutató/szerkeszthető folyamat. A szerződés/számla lépések kikerülnek (a
-- leads.contract_drive_link/invoice_drive_link/contract_sent_at/
-- invoice_sent_at oszlopok megmaradnak, csak kód nem ír beléjük többé), az
-- "Érdekli" állapot megszűnik (a régi "Érdekli" leadek Auditba kerülnek),
-- és két új lépés jön be (decision_pending, accepted) a régi contract/
-- invoice helyett.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_position TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sector TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_back_reason TEXT;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_sector_check;
ALTER TABLE leads ADD CONSTRAINT leads_sector_check CHECK (sector IS NULL OR sector IN ('b2b', 'b2c'));

UPDATE leads SET status = 'audit' WHERE status = 'interested';

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
    CHECK (status IN (
        'to_call', 'call_back', 'audit', 'meeting_scheduled',
        'decision_pending', 'accepted', 'not_interested', 'declined'
    ));
