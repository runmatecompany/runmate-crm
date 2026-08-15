-- A "Forgatás egyeztetése" / "Forgatás dátuma rögzítve" lépések megszűntek:
-- a forgatási dátumot mostantól a Google Naptár szinkron adja meg már a
-- tartalom létrehozásakor, nincs külön egyeztető előfázis.
UPDATE content_items SET status = 'script_writing' WHERE status IN ('shoot_pending', 'shoot_scheduled');

ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_status_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_status_check CHECK (status IN (
  'script_writing', 'script_review', 'shoot_done', 'editing', 'edit_review', 'scheduling', 'published'
));
ALTER TABLE content_items ALTER COLUMN status SET DEFAULT 'script_writing';
