-- Ügyfél törlésekor a hozzá tartozó tartalmak és naptár-szinkron sorok is
-- törlődjenek — eddig ezek CASCADE nélkül voltak, ami miatt egy ügyfél
-- törlése idegenkulcs-hibába futott, ha volt neki tartalma/naptár-sora.
ALTER TABLE content_items DROP CONSTRAINT content_items_client_id_fkey;
ALTER TABLE content_items ADD CONSTRAINT content_items_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE calendar_shoot_events DROP CONSTRAINT calendar_shoot_events_client_id_fkey;
ALTER TABLE calendar_shoot_events ADD CONSTRAINT calendar_shoot_events_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
