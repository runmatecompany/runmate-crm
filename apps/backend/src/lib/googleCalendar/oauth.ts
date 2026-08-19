import { OAuth2Client } from "google-auth-library";
import { config } from "../../config.js";
import { getConnection } from "../../db/googleCalendar.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  // Csak azokhoz a fájlokhoz/mappákhoz ad hozzáférést, amiket maga az app
  // hoz létre (ügyfél-mappák, feltöltött nyersanyag) — nem a teljes Drive-hoz.
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

export class GoogleCalendarNotConfiguredError extends Error {}

// Exportálva — a personalOauth.ts (vágónkénti Drive-kapcsolat) ugyanezt a
// Google Cloud OAuth klienst (Client ID/Secret/redirect_uri) használja
// újra, csak más scope-okkal és egy "state" paraméterrel megkülönböztetve,
// hogy ne kelljen egy második redirect_uri-t regisztrálni a Google Cloud
// Console-ban.
export function requireOAuthClient(): OAuth2Client {
  if (!config.googleClientId || !config.googleClientSecret || !config.publicUrl) {
    throw new GoogleCalendarNotConfiguredError(
      "A Google Naptár integráció nincs beállítva a szerveren (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / PUBLIC_URL)"
    );
  }
  return new OAuth2Client(
    config.googleClientId,
    config.googleClientSecret,
    `${config.publicUrl}/admin/google-calendar/oauth-callback`
  );
}

export function getAuthUrl(): string {
  const client = requireOAuthClient();
  // access_type: offline + prompt: consent kell ahhoz, hogy MINDIG kapjunk
  // frissítő tokent (enélkül Google csak az első kapcsolódáskor adna).
  return client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });
}

export async function exchangeCodeForTokens(code: string): Promise<{ email: string; refreshToken: string }> {
  const client = requireOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google nem adott vissza frissítő tokent — ha korábban már engedélyezted ezt az appot, előbb vond vissza a hozzáférést a Google-fiókod biztonsági beállításaiban, majd próbáld újra"
    );
  }
  client.setCredentials(tokens);
  const { data } = await client.request<{ email?: string }>({
    url: "https://www.googleapis.com/oauth2/v2/userinfo",
  });
  if (!data.email) {
    throw new Error("Nem sikerült lekérni a kapcsolódó Google-fiók email címét");
  }
  return { email: data.email, refreshToken: tokens.refresh_token };
}

// A tárolt frissítő tokenből egy használatra kész, friss access tokennel
// rendelkező klienst ad — vagy null-t, ha nincs kapcsolat.
export async function getAuthorizedClient(): Promise<OAuth2Client | null> {
  const connection = await getConnection();
  if (!connection) return null;
  const client = requireOAuthClient();
  client.setCredentials({ refresh_token: connection.refreshToken });
  return client;
}
