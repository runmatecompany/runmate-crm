import { getClientById } from "../db/clients.js";
import { getClientOnboarding } from "../db/clientOnboarding.js";
import { confirmClippingPayment, isClippingPaymentConfirmed } from "../db/clippingPeriods.js";
import { getAuthorizedClient } from "./googleCalendar/oauth.js";
import { listFolderChildren } from "./googleDrive/api.js";
import { ensureVideoSubfolder } from "./googleDrive/upload.js";

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
}

// A kész klippek száma NEM a rendszerben nyilvántartott content_items-ekből
// jön — nincs egyenként létrehozott/kilistázott "Vágásra vár" kártya —,
// hanem élőben a Drive-mappa tartalmából olvassuk ki, a fájlnevek alapján.
// Amíg a fizetés nincs jóváhagyva arra a hónapra, a szám el van rejtve
// (done: null) — a csapat még azt sem látja, hogy van-e már kész munka.
export async function getClippingProgress(clientId: number): Promise<ClippingProgress> {
  const profile = await getClientOnboarding(clientId);
  if (!profile?.service_clipping || !profile.monthly_video_target) {
    return { eligible: false, paymentConfirmed: false, target: null, done: null };
  }

  const yearMonth = currentYearMonth();
  const paymentConfirmed = await isClippingPaymentConfirmed(clientId, yearMonth);
  if (!paymentConfirmed) {
    return { eligible: true, paymentConfirmed: false, target: profile.monthly_video_target, done: null };
  }

  const client = await getClientById(clientId);
  const oauth = await getAuthorizedClient();
  if (!client?.drive_folder_id || !oauth) {
    return { eligible: true, paymentConfirmed: true, target: profile.monthly_video_target, done: null };
  }

  const folderId = await ensureVideoSubfolder(oauth, clientId, client.drive_folder_id, yearMonth, "edited");
  const files = await listFolderChildren(oauth, folderId);
  const doneNumbers = new Set<number>();
  for (const file of files) {
    const n = parseClipNumber(file.name);
    if (n != null) doneNumbers.add(n);
  }

  return { eligible: true, paymentConfirmed: true, target: profile.monthly_video_target, done: doneNumbers.size };
}

export async function confirmCurrentMonthClippingPayment(clientId: number): Promise<void> {
  await confirmClippingPayment(clientId, currentYearMonth());
}
