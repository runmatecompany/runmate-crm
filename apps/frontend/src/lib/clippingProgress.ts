import { authFetch } from "./api";
import { getApiUrl } from "./serverConfig";

// A Clippelés szolgáltatásnál a kész klippek száma nem a rendszerben
// nyilvántartott tartalmakból jön (nincs egyenként kilistázott "Vágásra
// vár" kártya), hanem élőben a havi kimeneti Drive-mappa fájlneveiből
// (lásd a backend lib/clipping.ts-ét). Amíg a fizetés nincs jóváhagyva
// arra a hónapra, a szám el van rejtve (done/nextClipNumber: null).
export interface ClippingProgress {
  eligible: boolean;
  paymentConfirmed: boolean;
  target: number | null;
  done: number | null;
  nextClipNumber: number | null;
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

// A vágó egyszerre több kész klipet is bedobhat — a szerver a mappa
// jelenlegi állása alapján automatikusan, sorban elnevezi és felírja
// őket a saját Drive-fiókjával, így garantáltan látható/számolható lesz
// a progress-számlálóban, függetlenül attól, ki kezdeményezte a
// feltöltést.
export async function uploadClippingClips(
  token: string,
  clientId: number,
  files: File[]
): Promise<{ progress: ClippingProgress; uploaded: number }> {
  const formData = new FormData();
  for (const file of files) formData.append("file", file);
  const res = await fetch(`${getApiUrl()}/clients/${clientId}/clipping-progress/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült feltölteni a fájlokat");
  }
  return res.json();
}
