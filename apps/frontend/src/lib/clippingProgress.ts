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

// A vágó egyszerre több kész klipet is bedobhat, de a feltöltés a
// szerver oldali sorszámozás (mappa aktuális állása alapján, lásd
// lib/clipping.ts beginClippingUpload) miatt csak szigorúan egymás
// után, egyenként mehet — a hívó fél (ClipUploadModal) egy for-loopban,
// fájlonként hívja ezt, csak akkor indítva a következőt, ha az előző
// teljesen lezárult. XHR kell a fetch helyett, mert csak az ad valódi
// feltöltési progress-eseményt (%) a UI progress-csíkjához.
// A "number" mezőt a hívó (ClipUploadModal) a getClippingProgress által
// visszaadott nextClipNumber-ből számolja, és sikeres feltöltésenként
// eggyel növeli — ezzel a szervernek nem kell fájlonként újra
// átvizsgálnia a teljes Drive-mappát a következő szabad sorszámért, ami
// a hónap végén (80-90+ fájlnál) érdemben lassította a feltöltést. A
// "number" mezőnek a FormData-ban a "file" előtt kell szerepelnie — a
// multipart stream csak egy irányba, sorban olvasható.
export function uploadClippingClip(
  token: string,
  clientId: number,
  file: File,
  number: number | null,
  onProgress: (percent: number) => void
): Promise<{ progress: ClippingProgress }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getApiUrl()}/clients/${clientId}/clipping-progress/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { progress?: ClippingProgress; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        // no-op — az onload alatti státusz-ág dönt a hibaüzenetről
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.progress) {
        resolve({ progress: body.progress });
      } else {
        reject(new Error(body.error ?? "Nem sikerült feltölteni a fájlt"));
      }
    };
    xhr.onerror = () => reject(new Error("Hálózati hiba a feltöltés közben"));
    const formData = new FormData();
    if (number != null) formData.append("number", String(number));
    formData.append("file", file);
    xhr.send(formData);
  });
}
