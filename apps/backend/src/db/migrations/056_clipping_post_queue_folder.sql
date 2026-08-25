-- A "Posztolni valók" modulban lévő klip-adag sorhoz kell egy gomb, ami az
-- appon belüli Drive-böngészőben egyenesen a havi "Megvágva" almappát
-- nyitja meg — ehhez a mappa Drive-azonosítóját a bekerüléskor eltároljuk,
-- nem kell újra feloldani minden listázásnál. A tábla időközben már élesben
-- használt (van benne valódi sor) — ezért itt visszatöltjük a meglévő
-- sor(ok) mappa-azonosítóját a content_upload_folders cache-ből, mielőtt
-- NOT NULL-lá tesszük az oszlopot.
ALTER TABLE clipping_post_queue ADD COLUMN folder_id TEXT;

UPDATE clipping_post_queue q
SET folder_id = f.edited_folder_id
FROM content_upload_folders f
WHERE f.client_id = q.client_id AND f.year_month = q.year_month AND f.edited_folder_id IS NOT NULL;

ALTER TABLE clipping_post_queue ALTER COLUMN folder_id SET NOT NULL;
