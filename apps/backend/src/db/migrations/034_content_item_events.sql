-- Munkatörténet: minden állapotváltásnál rögzíti, melyik kolléga vitte
-- tovább a feladatot az előző fázisból a következőbe — ebből lehet később
-- statisztikát számolni (ki mennyit dolgozott).
CREATE TABLE IF NOT EXISTS content_item_events (
    id SERIAL PRIMARY KEY,
    content_item_id INTEGER NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    user_name TEXT,
    from_status TEXT,
    to_status TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS content_item_events_item_idx ON content_item_events (content_item_id, created_at);
