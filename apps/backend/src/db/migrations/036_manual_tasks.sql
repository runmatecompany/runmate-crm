-- Kézzel felvett, eseti feladatok — nem a content_items gyártási
-- folyamathoz kötve (pl. "egységesíteni kell az ügyfél social media
-- neveit", "ügyfélnek kellene tartalom, de még nincs social oldala").
-- Ügyfélhez köthető, de nem kötelező (lehet cégen belüli, ügyfélfüggetlen
-- feladat is).
CREATE TABLE IF NOT EXISTS manual_tasks (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_tasks_client_idx ON manual_tasks (client_id);
CREATE INDEX IF NOT EXISTS manual_tasks_status_idx ON manual_tasks (status);

-- Munkatörténet ezekre a feladatokra is — ugyanaz a "ki mennyit dolgozott"
-- statisztikai igény vonatkozik rájuk, mint a content_items-ekre.
CREATE TABLE IF NOT EXISTS manual_task_events (
    id SERIAL PRIMARY KEY,
    manual_task_id INTEGER NOT NULL REFERENCES manual_tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    user_name TEXT,
    from_status TEXT,
    to_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS manual_task_events_task_idx ON manual_task_events (manual_task_id, created_at);
