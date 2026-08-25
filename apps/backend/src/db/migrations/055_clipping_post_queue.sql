-- A "Küldés posztolásra" gomb célja: az adott ügyfél havi klip-adagja
-- átkerüljön a "Vágásra vár" kanban-oszlopból a "Posztolni valók"
-- modulba. Ez a tábla ennek az átmenetnek az állapotát tárolja —
-- egy sor = egy ügyfél egy havi klip-adagja, ami posztolásra vár.
-- UNIQUE(client_id, year_month) teszi idempotenssé az ismételt
-- "Küldés posztolásra" kattintást.
CREATE TABLE IF NOT EXISTS clipping_post_queue (
    id SERIAL PRIMARY KEY,
    client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    year_month TEXT NOT NULL,
    clip_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, year_month)
);
