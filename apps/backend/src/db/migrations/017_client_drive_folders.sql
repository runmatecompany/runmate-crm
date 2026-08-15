ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS drive_folder_id TEXT,
    ADD COLUMN IF NOT EXISTS drive_raw_folder_id TEXT;

CREATE TABLE IF NOT EXISTS content_upload_folders (
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL,
    drive_folder_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (client_id, year_month)
);
