-- HR pipeline: a Leadek modul kibővítése egy teljes, automatizált
-- értékesítési folyamattá (audit, tárgyalás, szerződés, számlázás), a
-- meglévő leads táblán, nem egy párhuzamos új entitáson.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS meeting_date DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contract_drive_link TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contract_sent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS invoice_drive_link TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS invoice_sent_at TIMESTAMPTZ;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
    CHECK (status IN (
        'to_call', 'call_back', 'interested', 'audit', 'meeting_scheduled',
        'contract_sent', 'invoice_sent', 'became_customer', 'not_interested'
    ));
