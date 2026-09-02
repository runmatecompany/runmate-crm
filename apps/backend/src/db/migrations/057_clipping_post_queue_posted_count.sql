-- A "Posztolni valók" modul klip-adag soraihoz kézzel frissíthető
-- "hány lett eddig kiposztolva" számláló kell (a tényleges posztolás
-- TikTok/Instagram stb. felé nem látszik a Drive-ból, ezt csak manuálisan
-- lehet jelezni).
ALTER TABLE clipping_post_queue ADD COLUMN posted_count INTEGER NOT NULL DEFAULT 0;
