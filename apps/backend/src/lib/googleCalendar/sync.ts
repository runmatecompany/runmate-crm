import { getAuthorizedClient } from "./oauth.js";
import { getConnection, hasProcessedEvent, recordProcessedEvent, updateSyncToken } from "../../db/googleCalendar.js";
import { listAllClients, updateClientNextShootDate, type ClientRow } from "../../db/clients.js";
import { listContentItems } from "../../db/contentItems.js";
import { transitionContentItem } from "../socialMedia/transitions.js";
import { sendShootDateConfirmedEmail } from "./notify.js";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

// Nem a hivatalos SDK-t (googleapis / @googleapis/calendar) használjuk — azok
// generált típusdefiníciói ezen a gépen kifogyasztották a tsc memóriáját
// fordításkor. A Calendar API v3 sima REST API, ehhez a pár mezőhöz bőven
// elég egy saját, minimális típus.
export interface GoogleCalendarEvent {
  id: string;
  status: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: { email?: string }[];
}

interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

function eventStartDate(event: GoogleCalendarEvent): Date | null {
  const raw = event.start?.dateTime ?? event.start?.date;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function matchClient(event: GoogleCalendarEvent, clients: ClientRow[]): ClientRow | null {
  const attendeeEmails = new Set((event.attendees ?? []).map((a) => a.email?.toLowerCase()).filter(Boolean));
  const titleAndDescription = `${event.summary ?? ""} ${event.description ?? ""}`.toLowerCase();
  for (const client of clients) {
    if (client.email && attendeeEmails.has(client.email.toLowerCase())) return client;
    if (titleAndDescription.includes(client.company_name.toLowerCase())) return client;
  }
  return null;
}

async function processMatchedEvent(event: GoogleCalendarEvent, client: ClientRow, start: Date): Promise<void> {
  await updateClientNextShootDate(client.id, start);

  const items = await listContentItems({});
  const pendingForClient = items.filter((i) => i.client_id === client.id && i.status === "shoot_pending");
  for (const item of pendingForClient) {
    try {
      await transitionContentItem(item.id, "set_shoot_date", { shootDate: start.toISOString() });
    } catch {
      // Ha időközben más állapotba került, kihagyjuk — a next_shoot_date
      // mentése attól még megtörtént.
    }
  }

  await recordProcessedEvent({ googleEventId: event.id, clientId: client.id, eventStart: start });

  try {
    await sendShootDateConfirmedEmail(client, start);
  } catch {
    // Az emailküldés hibája (nincs küldő fiók beállítva stb.) ne akassza
    // meg a szinkront — a dátum már el van mentve, később pótolható.
  }
}

async function fetchEventsPage(
  accessToken: string,
  params: Record<string, string>
): Promise<GoogleCalendarEventsResponse> {
  const url = new URL(EVENTS_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const error = new Error(`Google Calendar API error: ${res.status}`);
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return res.json();
}

export async function syncGoogleCalendar(): Promise<void> {
  const client = await getAuthorizedClient();
  if (!client) return; // nincs kapcsolat, nincs mit szinkronizálni

  const { token: accessToken } = await client.getAccessToken();
  if (!accessToken) return;

  const connection = await getConnection();
  const clients = await listAllClients();

  let pageToken: string | undefined;
  let syncToken = connection?.syncToken ?? undefined;
  let nextSyncToken: string | undefined;
  let usingFullSync = !syncToken;

  do {
    const params: Record<string, string> = { singleEvents: "true" };
    if (pageToken) params.pageToken = pageToken;
    else if (syncToken) params.syncToken = syncToken;
    else {
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      params.updatedMin = sixtyDaysAgo.toISOString();
    }

    let page: GoogleCalendarEventsResponse;
    try {
      page = await fetchEventsPage(accessToken, params);
    } catch (err) {
      if ((err as { status?: number }).status === 410 && !usingFullSync) {
        // A sync token lejárt/érvénytelen — újrakezdjük teljes (updatedMin
        // alapú) szinkronnal, sync token nélkül.
        syncToken = undefined;
        pageToken = undefined;
        usingFullSync = true;
        continue;
      }
      throw err;
    }

    for (const event of page.items ?? []) {
      if (event.status === "cancelled") continue;
      if (await hasProcessedEvent(event.id)) continue;
      const start = eventStartDate(event);
      if (!start) continue;
      const client = matchClient(event, clients);
      if (!client) continue;
      await processMatchedEvent(event, client, start);
    }

    pageToken = page.nextPageToken;
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
  } while (pageToken);

  await updateSyncToken(nextSyncToken ?? syncToken ?? null);
}
