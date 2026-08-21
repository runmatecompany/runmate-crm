-- Munkatárs telefonszáma, hogy a kollégák elérhetőségi buborékban
-- láthassák egymás számát (Profilom > saját telefonszám).
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
