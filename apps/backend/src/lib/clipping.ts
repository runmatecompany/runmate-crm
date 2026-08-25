import type { Readable } from "node:stream";
import type { OAuth2Client } from "google-auth-library";
import { getClientById } from "../db/clients.js";
import { getClientOnboarding } from "../db/clientOnboarding.js";
import { confirmClippingPayment, isClippingPaymentConfirmed } from "../db/clippingPeriods.js";
import {
  deleteFolderGrant,
  getFolderGrant,
  listFolderGrantsForUser,
  recordFolderGrant,
} from "../db/userGoogleDrive.js";
import { pool } from "../db/pool.js";
import { createManualTask } from "../db/tasks.js";
import { getAuthorizedClient } from "./googleCalendar/oauth.js";
import { grantPermission, listFolderChildren, revokePermission } from "./googleDrive/api.js";
import { getReadyClient } from "./googleDrive/onboarding.js";
import { ensureVideoSubfolder, uploadStreamToFolder } from "./googleDrive/upload.js";

export class ClippingUploadError extends Error {}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// A hónapok nem egyforma hosszúak (28-31 nap) — egy napi rátából (pl.
// "napi 3 klip") a tényleges havi cél hónapról hónapra változik, nem lehet
// egy fix számmal helyesen lefedni mindegyiket.
function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

// A vágó a kész klippeket az appon keresztül tölti fel, számozva: "1",
// "2", "3"... Felülvágás esetén a javított verzió neve "1v2", "1v3" stb.
// — a szám ugyanaz marad, csak a verzió-utótag változik, tehát az "1" és
// "1v2" ugyanazt az 1. videót jelenti.
function parseClipNumber(filename: string): number | null {
  const base = filename.replace(/\.[^./]+$/, "");
  const match = base.match(/^(\d+)(?:v\d+)?$/);
  return match ? Number(match[1]) : null;
}

async function getReadyClippingContext(clientId: number) {
  const profile = await getClientOnboarding(clientId);
  if (!profile?.service_clipping) {
    throw new ClippingUploadError("Ennél az ügyfélnél nincs beállítva Clippelés szolgáltatás");
  }
  const yearMonth = currentYearMonth();
  const paymentConfirmed = await isClippingPaymentConfirmed(clientId, yearMonth);
  if (!paymentConfirmed) {
    throw new ClippingUploadError("A fizetés még nincs jóváhagyva erre a hónapra — a feltöltés nem indítható");
  }
  // getReadyClient ellenőrzi (és pótolja, ha kell) az ügyfél Drive-
  // gyökérmappáját — enélkül egy elavult (pl. kézzel törölt) mappa-
  // azonosítóra hivatkozva a feltöltés vagy néma, gyökérszintű
  // mappa-eltévedéssel, vagy (a jogosultság-adásnál) egy nyers 404-es
  // szerverhibával futott volna el, ahogy Kate Mesterjósnőnél is történt.
  const ready = await getReadyClient(clientId);
  if (!ready) {
    throw new ClippingUploadError("Nincs Google Drive kapcsolat beállítva, vagy az ügyfélnek nincs Drive-mappája");
  }
  const folderId = await ensureVideoSubfolder(ready.oauth, clientId, ready.client.drive_folder_id!, yearMonth, "edited");
  return { oauth: ready.oauth, folderId };
}

export interface ClippingProgress {
  eligible: boolean;
  paymentConfirmed: boolean;
  target: number | null;
  done: number | null;
  nextClipNumber: number | null;
}

// A kész klippek száma NEM a rendszerben nyilvántartott content_items-ekből
// jön — nincs egyenként létrehozott/kilistázott "Vágásra vár" kártya —,
// hanem élőben a Drive-mappa tartalmából olvassuk ki, a fájlnevek alapján.
// Amíg a fizetés nincs jóváhagyva arra a hónapra, minden el van rejtve
// (done/nextClipNumber: null) — a vágó csak jóváhagyás után férhet hozzá a
// feltöltéshez, ez a fizetés-gate lényege.
export async function getClippingProgress(clientId: number): Promise<ClippingProgress> {
  const profile = await getClientOnboarding(clientId);
  const dailyTarget = profile?.clipping_daily_target;
  if (!profile?.service_clipping || (!dailyTarget && !profile.monthly_video_target)) {
    return { eligible: false, paymentConfirmed: false, target: null, done: null, nextClipNumber: null };
  }

  const yearMonth = currentYearMonth();
  const target = dailyTarget ? dailyTarget * daysInMonth(yearMonth) : profile.monthly_video_target;

  const paymentConfirmed = await isClippingPaymentConfirmed(clientId, yearMonth);
  if (!paymentConfirmed) {
    return { eligible: true, paymentConfirmed: false, target, done: null, nextClipNumber: null };
  }

  const client = await getClientById(clientId);
  const oauth = await getAuthorizedClient();
  if (!client?.drive_folder_id || !oauth) {
    return { eligible: true, paymentConfirmed: true, target, done: null, nextClipNumber: null };
  }

  const folderId = await ensureVideoSubfolder(oauth, clientId, client.drive_folder_id, yearMonth, "edited");
  const files = await listFolderChildren(oauth, folderId);
  const doneNumbers = new Set<number>();
  for (const file of files) {
    const n = parseClipNumber(file.name);
    if (n != null) doneNumbers.add(n);
  }

  return {
    eligible: true,
    paymentConfirmed: true,
    target,
    done: doneNumbers.size,
    nextClipNumber: doneNumbers.size > 0 ? Math.max(...doneNumbers) + 1 : 1,
  };
}

export async function confirmCurrentMonthClippingPayment(clientId: number): Promise<void> {
  await confirmClippingPayment(clientId, currentYearMonth());
}

// A vágó "Küldés posztolásra" gombja a "Vágásra vár" oszlopban — csak
// akkor jelenik meg a frontenden, ha a havi cél már meg van, de a
// szerver is ellenőrzi, nehogy valaki idő előtt elküldhesse. Ugyanaz az
// idempotens, cím alapú minta, mint a kickoff-feladatoknál
// (clientOnboarding.ts ensureKickoffTask) — ismételt kattintásra nem jön
// létre duplikált feladat, csak jelezzük, hogy már el lett küldve.
export async function sendClippingForPosting(clientId: number, createdBy: number): Promise<{ alreadySent: boolean }> {
  const progress = await getClippingProgress(clientId);
  if (!progress.eligible || !progress.paymentConfirmed) {
    throw new ClippingUploadError("A fizetés még nincs jóváhagyva erre a hónapra");
  }
  if (progress.target == null || progress.done == null || progress.done < progress.target) {
    throw new ClippingUploadError("Még nincs meg a havi klip-mennyiség");
  }
  const client = await getClientById(clientId);
  if (!client) throw new ClippingUploadError("Az ügyfél nem található");

  const yearMonth = currentYearMonth();
  const title = `Posztolásra kész klipek – ${client.company_name} (${yearMonth})`;
  const { rowCount } = await pool.query(`SELECT 1 FROM manual_tasks WHERE client_id = $1 AND title = $2`, [
    clientId,
    title,
  ]);
  if ((rowCount ?? 0) > 0) {
    return { alreadySent: true };
  }
  await createManualTask({
    title,
    description: `Elkészült a havi ${progress.target} klip (${client.company_name}), postázásra kész.`,
    clientId,
    createdBy,
  });
  return { alreadySent: false };
}

export interface ClippingUploadContext {
  oauth: OAuth2Client;
  folderId: string;
  nextNumber: number;
}

// A vágó a kész klipeket egyenként, szigorúan sorban tölti fel (lásd
// ClipUploadModal.tsx) — a frontend maga is tudja a következő sorszámot
// (a getClippingProgress válaszából, majd minden sikeres feltöltés után
// eggyel növelve), és elküldi explicit "number" mezőként. Ha ez megvan,
// nem kell a teljes mappát újra átvizsgálni fájlonként (ez sok Drive
// API-hívást és DB-lekérdezést takarít meg a hónap végére, amikor már
// sok fájl van a mappában) — a mappa-scan csak fallback, ha valamiért
// nincs explicit szám (pl. régebbi kliens, vagy hibás válasz).
export async function beginClippingUpload(clientId: number, explicitNumber?: number): Promise<ClippingUploadContext> {
  const { oauth, folderId } = await getReadyClippingContext(clientId);
  if (explicitNumber != null) {
    return { oauth, folderId, nextNumber: explicitNumber };
  }
  const existing = await listFolderChildren(oauth, folderId);
  const doneNumbers = existing.map((f) => parseClipNumber(f.name)).filter((n): n is number => n != null);
  const nextNumber = doneNumbers.length > 0 ? Math.max(...doneNumbers) + 1 : 1;
  return { oauth, folderId, nextNumber };
}

// Egy fájl streamelt feltöltése a kiszámolt sorszámmal — a saját (RunMate)
// Drive-fiókkal, így garantáltan látható/számolható lesz, függetlenül
// attól, ki kezdeményezte a feltöltést az appban. Ez pontosan azért
// kellett, mert a korábbi "bárki linkkel" megosztásos feltöltésnél a
// fájlok más Google-fiók alá kerültek, és a RunMate-fiók Drive API-ja
// egyáltalán nem látta őket.
export async function uploadNumberedClip(
  ctx: ClippingUploadContext,
  number: number,
  originalFilename: string,
  mimetype: string,
  stream: Readable
): Promise<void> {
  const extensionMatch = originalFilename.match(/\.[^./]+$/);
  const extension = extensionMatch ? extensionMatch[0] : "";
  const filename = `${number}${extension}`;
  await uploadStreamToFolder(ctx.oauth, ctx.folderId, filename, mimetype, stream);
}

// Az első alkalommal, amikor egy vágó a saját (összekötött) Google-
// fiókjával akar feltölteni egy adott ügyfélnek, a RunMate szolgáltatás-
// fiók (getAuthorizedClient) névre szólóan szerkesztői jogot ad neki az
// ügyfél Drive-mappájára — ez a Drive-jogosultság-öröklés miatt az összes
// almappára (Videók/Megvágva stb.) is érvényes lesz. Innentől a vágó saját
// tokenjével közvetlenül tud feltölteni, a RunMate szerver megkerülésével.
// Idempotens: ismételt hívásnál a user_drive_folder_grants tábla alapján
// azonnal visszatér, nem hív Drive API-t feleslegesen.
export async function ensureVagoFolderAccess(userId: number, clientId: number, vagoEmail: string): Promise<void> {
  const existing = await getFolderGrant(userId, clientId);
  if (existing) return;

  const ready = await getReadyClient(clientId);
  if (!ready) {
    throw new ClippingUploadError("Nincs Google Drive kapcsolat beállítva, vagy az ügyfélnek nincs Drive-mappája");
  }
  const permissionId = await grantPermission(ready.oauth, ready.client.drive_folder_id!, vagoEmail);
  await recordFolderGrant(userId, clientId, permissionId);
}

// Amikor egy vágó elveszti a klip-feltöltéshez szükséges hozzáférést
// (Ügyfelek ÉS Social Media access is lekerül róla — lásd
// routes/admin/userAccess.ts), a korábban névre szólóan megadott
// Drive-mappa jogokat is visszavonjuk nála, hogy ne maradjon hozzáférése
// olyan ügyfél-mappákhoz, amikhez a RunMate-en belül már nincs joga.
// Best-effort: egy sikertelen visszavonás nem akasztja meg a többit.
export async function revokeAllDriveFolderGrants(userId: number): Promise<void> {
  const grants = await listFolderGrantsForUser(userId);
  if (grants.length === 0) return;

  const serviceOauth = await getAuthorizedClient();
  if (!serviceOauth) return;

  for (const grant of grants) {
    try {
      const client = await getClientById(grant.clientId);
      if (client?.drive_folder_id) {
        await revokePermission(serviceOauth, client.drive_folder_id, grant.drivePermissionId);
      }
    } catch {
      // Best-effort — a DB-rekordot akkor is töröljük, hogy legközelebb
      // (ha újra hozzáférést kap) friss jogot kapjon, ne akadjon el egy
      // már amúgy is érvénytelen permission-ID miatt.
    }
    await deleteFolderGrant(userId, grant.clientId);
  }
}
