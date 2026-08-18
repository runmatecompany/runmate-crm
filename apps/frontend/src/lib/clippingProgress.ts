import { authFetch } from "./api";
import { getApiUrl } from "./serverConfig";

// A Clippelés szolgáltatásnál a kész klippek száma nem a rendszerben
// nyilvántartott tartalmakból jön (nincs egyenként kilistázott "Vágásra
// vár" kártya), hanem élőben a havi kimeneti Drive-mappa fájlneveiből
// (lásd a backend lib/clipping.ts-ét). Amíg a fizetés nincs jóváhagyva
// arra a hónapra, a szám el van rejtve (done: null).
export interface ClippingProgress {
  eligible: boolean;
  paymentConfirmed: boolean;
  target: number | null;
  done: number | null;
  sourceFolderUrl: string | null;
  outputFolderUrl: string | null;
}

export async function getClippingProgress(token: string, clientId: number): Promise<ClippingProgress> {
  const res = await authFetch(token, `/clients/${clientId}/clipping-progress`);
  const data = await res.json();
  return data.progress;
}

export async function confirmClippingPayment(token: string, clientId: number): Promise<ClippingProgress> {
  const res = await authFetch(token, `/clients/${clientId}/clipping-progress/confirm-payment`, { method: "POST" });
  const data = await res.json();
  return data.progress;
}

// A vágó ide tölti fel a kész klipet — a szerver a saját Drive-fiókjával
// írja fel, így garantáltan látható/számolható lesz a progress-
// számlálóban, függetlenül attól, ki kezdeményezte a feltöltést.
export async function uploadClippingClip(
  token: string,
  clientId: number,
  clipNumber: number,
  version: number | null,
  file: File
): Promise<ClippingProgress> {
  const formData = new FormData();
  formData.append("clipNumber", String(clipNumber));
  if (version) formData.append("version", String(version));
  formData.append("file", file);
  const res = await fetch(`${getApiUrl()}/clients/${clientId}/clipping-progress/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült feltölteni a fájlt");
  }
  const data = await res.json();
  return data.progress;
}
