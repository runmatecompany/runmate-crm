import type { OAuth2Client } from "google-auth-library";
import { requireOAuthClient } from "../googleCalendar/oauth.js";
import { getUserDriveConnection } from "../../db/userGoogleDrive.js";

// A vágó saját, személyes Google-fiókjának összekötése — ugyanazt a Google
// Cloud OAuth klienst (és ugyanazt a már regisztrált redirect_uri-t) újra
// használja, mint a globális Naptár/Drive-kapcsolat (lib/googleCalendar/
// oauth.ts), csak szűkebb scope-okkal és egy "state=personal:<userId>"
// jelöléssel — így nem kell második redirect_uri-t felvenni a Google Cloud
// Console-ban, a meglévő callback (routes/googleCalendarOauth.ts) ágazik
// el a state alapján.
const PERSONAL_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

const PERSONAL_STATE_PREFIX = "personal:";

export function getPersonalAuthUrl(userId: number): string {
  const client = requireOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: PERSONAL_SCOPES,
    state: `${PERSONAL_STATE_PREFIX}${userId}`,
  });
}

// Ha a state ilyen alakú, a callback a személyes (nem a globális naptár-)
// kapcsolatot kezeli — a userId-t a state hordozza.
export function parsePersonalOAuthState(state: string | undefined): number | null {
  if (!state?.startsWith(PERSONAL_STATE_PREFIX)) return null;
  const userId = Number(state.slice(PERSONAL_STATE_PREFIX.length));
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export async function exchangePersonalCode(code: string): Promise<{ email: string; refreshToken: string }> {
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
// rendelkező klienst ad — vagy null-t, ha a vágó még nem kötötte össze a
// saját fiókját.
export async function getUserAuthorizedClient(userId: number): Promise<OAuth2Client | null> {
  const connection = await getUserDriveConnection(userId);
  if (!connection) return null;
  const client = requireOAuthClient();
  client.setCredentials({ refresh_token: connection.refreshToken });
  return client;
}
