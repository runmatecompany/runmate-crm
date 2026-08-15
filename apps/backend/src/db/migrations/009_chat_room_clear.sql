-- A /clear parancs "soft clear"-t végez: az üzenetek megmaradnak az
-- adatbázisban, csak a cleared_at időpont utáni üzeneteket listázzuk.
-- A /restore parancs cleared_at-ot NULL-ra állítva egyszerűen visszahozza
-- az egészet.
ALTER TABLE chat_rooms
  ADD COLUMN cleared_at TIMESTAMPTZ,
  ADD COLUMN cleared_by INTEGER REFERENCES users(id);
