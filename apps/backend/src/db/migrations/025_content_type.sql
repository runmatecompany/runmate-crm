-- Eddig a content_items kizárólag videó-gyártásra volt szabva (script/
-- forgatás/vágás fázisok). A "Feladatok" modulhoz a képes posztokat is
-- ugyanide vesszük fel, egy egyszerűsített, 4 fázisú állapotsorral
-- (planning/approval nem videó-specifikus, a scheduling/published közös).
ALTER TABLE content_items
    ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'video'
        CHECK (content_type IN ('video', 'image_post'));

ALTER TABLE content_items DROP CONSTRAINT IF EXISTS content_items_status_check;
ALTER TABLE content_items ADD CONSTRAINT content_items_status_check CHECK (status IN (
  'script_writing', 'script_review', 'shoot_done', 'editing', 'edit_review', 'scheduling', 'published',
  'planning', 'approval'
));
