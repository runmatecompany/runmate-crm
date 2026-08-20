-- Ügyfél-törlési kérelem: nem-admin csak kérelmezni tudja egy ügyfél
-- törlését, ténylegesen csak admin törölhet. A kérelem egy manual_tasks
-- sorral is jár (hogy a Feladatok modulban is látszon), a UNIQUE
-- client_id biztosítja, hogy egyszerre csak egy aktív kérelem legyen
-- ügyfelenként.
CREATE TABLE IF NOT EXISTS client_deletion_requests (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
    requested_by INTEGER NOT NULL REFERENCES users(id),
    manual_task_id INTEGER REFERENCES manual_tasks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
