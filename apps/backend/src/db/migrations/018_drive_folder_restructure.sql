-- Az ügyfélmappák mostantól "Runmate CRM/Ügyfelek/{cégnév}" alatt jönnek
-- létre (nem közvetlenül a Drive gyökerében), és a havi mappa alatt egy
-- "Videók" mappában "Nyersek"/"Megvágva" almappák vannak, nem egy fix
-- "Forgatások/Nyers fájlok" lánc alatt. A drive_raw_folder_id ezért elavult.
ALTER TABLE clients
    DROP COLUMN IF EXISTS drive_raw_folder_id;

ALTER TABLE content_upload_folders
    ADD COLUMN IF NOT EXISTS raw_folder_id TEXT,
    ADD COLUMN IF NOT EXISTS edited_folder_id TEXT;
