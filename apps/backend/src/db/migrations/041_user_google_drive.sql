-- Vágónkénti, önálló Google-fiók összekötés (elkülönül a globális
-- google_calendar_connection singleton kapcsolattól) — ez teszi lehetővé,
-- hogy a klip-feltöltés a vágó saját Drive-fiókjával, közvetlenül menjen,
-- a RunMate szerver megkerülésével.
CREATE TABLE IF NOT EXISTS user_google_drive_connections (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    connected_email TEXT NOT NULL,
    refresh_token_enc TEXT NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Melyik vágó melyik ügyfél Drive-mappájához kapott már névre szóló
-- szerkesztői jogot a RunMate szolgáltatás-fióktól — a drive_permission_id
-- kell ahhoz, hogy a jogot pontosan vissza is tudjuk vonni, ha a vágó
-- elveszti a hozzáférését.
CREATE TABLE IF NOT EXISTS user_drive_folder_grants (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    drive_permission_id TEXT NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, client_id)
);
