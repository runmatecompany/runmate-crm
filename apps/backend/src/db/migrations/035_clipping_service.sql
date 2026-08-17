-- Clippelés szolgáltatás: az ügyfél saját nyersanyagot ad (rögzített forrás
-- mappa), nincs script/forgatás fázis, egyenesen "Vágásra vár" állapotban
-- indul a tartalom. A clipping_batches egyedi (client_id, year_month) párt
-- tart nyilván, hogy havonta csak egyszer generálódjon le a köteg.
ALTER TABLE client_ai_profiles
    ADD COLUMN IF NOT EXISTS service_clipping BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS clipping_source_folder_url TEXT;

CREATE TABLE IF NOT EXISTS clipping_batches (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, year_month)
);

-- Nincs még számlázási/fizetési modul — ezt előkészítjük rá: az
-- automatikusan generált Clippelés-köteg elemei payment_confirmed=false-szal
-- jönnek létre, és amíg admin jóvá nem hagyja (be nem folyt a fizetés),
-- a felület nem engedi elindítani rajtuk a munkát. A meglévő/kézzel
-- létrehozott tartalmakat ez nem érinti (alapértelmezetten true).
ALTER TABLE content_items
    ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN NOT NULL DEFAULT true;
