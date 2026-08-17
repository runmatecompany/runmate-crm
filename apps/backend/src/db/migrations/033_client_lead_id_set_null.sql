-- Mivel ügyféllé alakításkor a lead mostantól törlődik (nem csak
-- became_customer-re vált), a clients.lead_id hivatkozásnak túl kell élnie
-- a lead törlését — enélkül a konverzió idegenkulcs-hibába futott.
ALTER TABLE clients DROP CONSTRAINT clients_lead_id_fkey;
ALTER TABLE clients ADD CONSTRAINT clients_lead_id_fkey
    FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
