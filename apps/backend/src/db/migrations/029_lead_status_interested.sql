-- "called" állapot megszűnik, helyette "interested" (Érdekli) — a hívás
-- után a kolléga eldönti, hogy visszahívandó, érdekli (kötelező jegyzettel),
-- vagy nem érdekli.
UPDATE leads SET status = 'to_call' WHERE status = 'called';

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
    CHECK (status IN ('to_call', 'call_back', 'interested', 'became_customer', 'not_interested'));
