import type { Readable } from "node:stream";
import { getClientById } from "../db/clients.js";
import { getClientOnboarding } from "../db/clientOnboarding.js";
import { confirmClippingPayment, isClippingPaymentConfirmed } from "../db/clippingPeriods.js";
import { getAuthorizedClient } from "./googleCalendar/oauth.js";
import { driveFolderLink, listFolderChildren } from "./googleDrive/api.js";
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

// A vágó a kész klippeket közvetlenül a havi "Videók/Megvágva" Drive-
// mappába tölti fel, számozva: "1", "2", "3"... Felülvágás esetén a
// javított verzió neve "1v2", "1v3" stb. — a szám ugyanaz marad, csak a
// verzió-utótag változik, tehát az "1" és "1v2" ugyanazt az 1. videót
// jelenti (a legfrissebb verziót számítjuk késznek, a count-hoz elég az
// egyedi videó-sorszámokat összeszámolni).
function parseClipNumber(filename: string): number | null {
  const base = filename.replace(/\.[^./]+$/, "");
  const match = base.match(/^(\d+)(?:v\d+)?$/);
  return match ? Number(match[1]) : null;
}

export interface ClippingProgress {
  eligible: boolean;
  paymentConfirmed: boolean;
  target: number | null;
  done: number | null;
  sourceFolderUrl: string | null;
  outputFolderUrl: string | null;
}

// A kész klippek száma NEM a rendszerben nyilvántartott content_items-ekből
// jön — nincs egyenként létrehozott/kilistázott "Vágásra vár" kártya —,
// hanem élőben a Drive-mappa tartalmából olvassuk ki, a fájlnevek alapján.
// Amíg a fizetés nincs jóváhagyva arra a hónapra, minden el van rejtve
// (done/mappalinkek: null) — a vágó csak jóváhagyás után férhet hozzá a
// munkához szükséges mappákhoz, ez a fizetés-gate lényege.
export async function getClippingProgress(clientId: number): Promise<ClippingProgress> {
  const profile = await getClientOnboarding(clientId);
  const dailyTarget = profile?.clipping_daily_target;
  if (!profile?.service_clipping || (!dailyTarget && !profile.monthly_video_target)) {
    return { eligible: false, paymentConfirmed: false, target: null, done: null, sourceFolderUrl: null, outputFolderUrl: null };
  }

  const yearMonth = currentYearMonth();
  const target = dailyTarget ? dailyTarget * daysInMonth(yearMonth) : profile.monthly_video_target;

  const paymentConfirmed = await isClippingPaymentConfirmed(clientId, yearMonth);
  if (!paymentConfirmed) {
    return { eligible: true, paymentConfirmed: false, target, done: null, sourceFolderUrl: null, outputFolderUrl: null };
  }

  const client = await getClientById(clientId);
  const oauth = await getAuthorizedClient();
  if (!client?.drive_folder_id || !oauth) {
    return {
      eligible: true,
      paymentConfirmed: true,
      target,
      done: null,
      sourceFolderUrl: profile.clipping_source_folder_url,
      outputFolderUrl: null,
    };
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
    sourceFolderUrl: profile.clipping_source_folder_url,
    outputFolderUrl: driveFolderLink(folderId),
  };
}

export async function confirmCurrentMonthClippingPayment(clientId: number): Promise<void> {
  await confirmClippingPayment(clientId, currentYearMonth());
}

// A vágó az appon keresztül tölti fel a kész klipet — a szerver a saját
// (RunMate) Drive-fiókjával írja fel, így garantáltan látható/számolható
// lesz, függetlenül attól, ki kezdeményezte a feltöltést a szoftverben.
// Ez pontosan azért kellett, mert a korábbi "bárki linkkel" megosztásos
// feltöltésnél a fájlok más Google-fiók alá kerültek, és a RunMate-fiók
// Drive API-ja egyáltalán nem látta őket.
export async function uploadClippingClip(
  clientId: number,
  clipNumber: number,
  version: number | null,
  originalFilename: string,
  mimetype: string,
  fileStream: Readable
): Promise<void> {
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

  const extensionMatch = originalFilename.match(/\.[^./]+$/);
  const extension = extensionMatch ? extensionMatch[0] : "";
  const filename = `${clipNumber}${version ? `v${version}` : ""}${extension}`;

  const folderId = await ensureVideoSubfolder(oauth, clientId, client.drive_folder_id, yearMonth, "edited");
  await uploadStreamToFolder(oauth, folderId, filename, mimetype, fileStream);
}
