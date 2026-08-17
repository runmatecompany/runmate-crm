-- A Clippelés-nél mostantól NEM a rendszer hoz létre egyenként content_items
-- sorokat "Vágásra vár" állapotban — a vágó közvetlenül a havi Drive-
-- kimeneti mappába ("Videók/Megvágva") tölti fel a kész klippeket,
-- számozva (1, 2, 3...), felülvágás esetén "1v2", "1v3" stb. utótaggal. A
-- rendszer ezt a mappát olvassa be és számolja meg, hány egyedi videó van
-- készen a havi célhoz képest.
--
-- A clipping_batches tábla korábban azt jelezte, hogy egy adott
-- (ügyfél, hónap) párra már legenerálódott a content_items köteg — ez a
-- fogalom megszűnt, a tábla mostantól a fizetés-jóváhagyás állapotát
-- tartja nyilván (ügyfelenként/hónaponként), ami addig elrejti a kész
-- videók számát, amíg admin jóvá nem hagyja, hogy az ügyfél fizetett.
ALTER TABLE clipping_batches RENAME TO clipping_periods;
ALTER TABLE clipping_periods ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN NOT NULL DEFAULT false;
