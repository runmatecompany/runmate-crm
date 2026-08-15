import { createHmac } from "node:crypto";
import { config } from "../../config.js";

// Rövid, aláírt (nem adatbázisban tárolt) token a .ics letöltési linkhez —
// a payload maga a client_id + időpont, a HMAC csak azt igazolja, hogy mi
// állítottuk elő, nem kell hozzá külön adatbázis-táblát vezetni.
export interface IcsTokenPayload {
  clientId: number;
  isoDate: string;
}

function sign(payload: string): string {
  return createHmac("sha256", config.emailEncryptionKey).update(payload).digest("base64url");
}

export function buildIcsToken(input: IcsTokenPayload): string {
  const payload = Buffer.from(JSON.stringify(input)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyIcsToken(token: string): IcsTokenPayload | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig || sig !== sign(payload)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.clientId !== "number" || typeof data.isoDate !== "string") return null;
    return data;
  } catch {
    return null;
  }
}
