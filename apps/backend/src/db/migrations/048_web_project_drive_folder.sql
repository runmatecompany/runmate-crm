-- A Web modul projektjeihez saját Drive-almappa (ügyfélmappa/Web/{projekt}),
-- ide töltődnek fel a kész weboldal-fájlok, hogy bármelyik kolléga elérje,
-- ne csak aki a gépén elkészítette.
ALTER TABLE web_projects ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
