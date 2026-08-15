ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS image_mime TEXT,
    ADD COLUMN IF NOT EXISTS image_data BYTEA;
