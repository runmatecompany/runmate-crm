-- A havi cél Clippelésnél eddig fix szám volt (pl. 90), de a hónapok nem
-- egyforma hosszúak (28-31 nap) — egy napi rátából (pl. "napi 3 klip") a
-- rendszer mostantól minden hónapra a tényleges napszám alapján számolja ki
-- a célt, nem kell hónapról hónapra kézzel újraírni.
ALTER TABLE client_onboarding_profiles ADD COLUMN IF NOT EXISTS clipping_daily_target INTEGER;

-- Kate Mesterjósnő eddigi 90-es havi célja "napi 3"-ból jött (kb. 30 napos
-- hónapra) — most átvisszük a napi rátára, hogy augusztus (31 nap) és a
-- rövidebb hónapok is helyesen számolódjanak.
UPDATE client_onboarding_profiles
SET clipping_daily_target = 3
WHERE client_id = (SELECT id FROM clients WHERE company_name = 'Kate Mesterjósnő')
  AND service_clipping = true;
