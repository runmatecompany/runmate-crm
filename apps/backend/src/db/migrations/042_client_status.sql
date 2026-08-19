-- Aktív/passzív ügyfél-kategorizálás az Ügyfelek listához: egy alkalmi
-- ("one_off") ügyfélnél a projekt lezárása után nincs több aktív munka
-- ("closed"), bármelyik ügyfél kérhet szüneteltetést is ("paused") — a
-- lista ez alapján bontja külön az aktív és passzív ügyfeleket. A
-- client_type (havi megújuló / alkalmi) csak tájékoztató jellegű, a
-- státuszt attól függetlenül, kézzel állítja be a csapat.
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
    ADD COLUMN IF NOT EXISTS client_type TEXT CHECK (client_type IN ('monthly', 'one_off'));
