import type { Readable } from "node:stream";
import type { OAuth2Client } from "google-auth-library";
import { getClientById } from "../db/clients.js";
import { getClientOnboarding } from "../db/clientOnboarding.js";
import { confirmClippingPayment, isClippingPaymentConfirmed } from "../db/clippingPeriods.js";
import { getAuthorizedClient } from "./googleCalendar/oauth.js";
import { listFolderChildren } from "./googleDrive/api.js";
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
  const client = await getClientById(clientId);
  if (!client?.drive_folder_id) {
    throw new ClippingUploadError("Az ügyfélnek nincs Drive-mappája");
  }
  const oauth = await getAuthorizedClient();
  if (!oauth) {
    throw new ClippingUploadError("Nincs Google Drive kapcsolat beállítva");
  }
  const folderId = await ensureVideoSubfolder(oauth, clientId, client.drive_folder_id, yearMonth, "edited");
  return { oauth, folderId };
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

export interface ClippingUploadContext {
  oauth: OAuth2Client;
  folderId: string;
  nextNumber: number;
}

// A vágó egyszerre több kész klipet dob be egy üres pop-up ablakba — a
// mappa jelenlegi állása alapján itt derül ki, honnantól kezdve szabadok a
// sorszámok, mielőtt a fájlok tényleges feltöltése (uploadNumberedClip,
// egyenként, streamelve) elkezdődne.
export async function beginClippingUpload(clientId: number): Promise<ClippingUploadContext> {
  const { oauth, folderId } = await getReadyClippingContext(clientId);
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
