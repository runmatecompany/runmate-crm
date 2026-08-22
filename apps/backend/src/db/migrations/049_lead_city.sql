-- Szabad szöveges város mező a Leadekhez, hogy a listában is látszódjon,
-- melyik lead melyik városban van.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT;
