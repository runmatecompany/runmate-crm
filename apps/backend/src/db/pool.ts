import { Pool, types } from "pg";
import { config } from "../config.js";

// A pg alapértelmezetten DATE oszlopokból JS Date objektumot csinál, amit a
// JSON.stringify UTC-re konvertál — ha a szervergép időzónája nem UTC (itt
// UTC+1/+2), ez egy nappal el tudja csúsztatni a dátumot (pl. "2026-08-24"
// -> "2026-08-23T22:00:00.000Z"). A DATE (OID 1082) típusparsert felülírjuk,
// hogy a nyers "YYYY-MM-DD" stringet adja vissza módosítás nélkül.
types.setTypeParser(1082, (value) => value);

export const pool = new Pool({
  connectionString: config.databaseUrl,
});
