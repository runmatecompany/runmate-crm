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
  sentForPosting: boolean;
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

// Jelzi, hogy a havi klip-mennyiség kész és posztolásra átadható —
// idempotens: ismételt hívásra nem jön létre újabb bejegyzés, csak
// alreadySent: true jön vissza. A klip-adag ettől kezdve a "Posztolni
// valók" modulban (listClippingPostQueue) jelenik meg, a "Vágásra vár"
// kanbanból pedig eltűnik.
export async function sendClippingForPosting(token: string, clientId: number): Promise<{ alreadySent: boolean }> {
  const res = await authFetch(token, `/clients/${clientId}/clipping-progress/send-for-posting`, { method: "POST" });
  return res.json();
}

export interface ClippingPostQueueEntry {
  id: number;
  client_id: number;
  client_name: string;
  year_month: string;
  clip_count: number;
  posted_count: number;
  folder_id: string;
  created_at: string;
}

export async function listClippingPostQueue(token: string): Promise<ClippingPostQueueEntry[]> {
  const res = await authFetch(token, "/clipping-post-queue");
  const data = await res.json();
  return data.entries;
}

// A tényleges posztolás (TikTok/Instagram stb.) nem látszik a Drive-ból,
// ezt csak kézzel lehet jelezni — nincs automatikus/lezáró művelet, a
// bejegyzés addig a listában marad, amíg valaki frissíti ezt a számot.
export async function updateClippingPostedCount(
  token: string,
  id: number,
  postedCount: number
): Promise<ClippingPostQueueEntry> {
  const res = await authFetch(token, `/clipping-post-queue/${id}/posted-count`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postedCount }),
  });
  const data = await res.json();
  return data.entry;
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

export interface ClipUploadSession {
  accessToken: string;
  folderId: string;
  nextNumber: number;
}

// Ha a vágó összekötötte a saját Google-fiókját (Beállítások > Profilom),
// ez az endpoint nem fogad fájlt — csak előkészíti a feltöltést (jog-
// ellenőrzés, a szükséges esetben automatikus névre szóló mappa-jog a
// vágónak, sorszám-kiosztás), és egy rövid élettartamú Google access
// tokent ad, amivel a fájl a RunMate szerver megkerülésével, egyenesen a
// vágó gépéről megy a Drive-ra (lásd uploadClipDirectToGoogle).
export async function beginDirectClipUpload(
  token: string,
  clientId: number,
  number: number | null
): Promise<ClipUploadSession> {
  const res = await authFetch(token, `/clients/${clientId}/clipping-progress/upload-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ number: number ?? undefined }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Nem sikerült előkészíteni a feltöltést");
  }
  return res.json();
}

// A tényleges bájtok innentől SOSEM érintik a RunMate szervert — a
// resumable-upload session indítása és a fájl PUT-ja is közvetlenül a
// Google API-ja felé megy, a vágó saját access tokenjével. Élőben tesztelve
// ez a minta (Authorization fejléc minden kérésen) átmegy a Google CORS-
// ellenőrzésén; egy korábbi, anonim session-es próbálkozás (a szerver
// hozta létre a session-t, a böngésző csak PUT-olt bele) NEM ment át.
export function uploadClipDirectToGoogle(
  session: ClipUploadSession,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const extMatch = file.name.match(/\.[^./]+$/);
    const filename = `${session.nextNumber}${extMatch ? extMatch[0] : ""}`;

    const initXhr = new XMLHttpRequest();
    initXhr.open("POST", "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true");
    initXhr.setRequestHeader("Authorization", `Bearer ${session.accessToken}`);
    initXhr.setRequestHeader("Content-Type", "application/json; charset=UTF-8");
    initXhr.setRequestHeader("X-Upload-Content-Type", file.type || "application/octet-stream");
    initXhr.onload = () => {
      if (initXhr.status < 200 || initXhr.status >= 300) {
        reject(new Error("Nem sikerült elindítani a Drive feltöltést"));
        return;
      }
      const sessionUrl = initXhr.getResponseHeader("Location");
      if (!sessionUrl) {
        reject(new Error("A Drive nem adott feltöltési session URL-t"));
        return;
      }
      const putXhr = new XMLHttpRequest();
      putXhr.open("PUT", sessionUrl);
      putXhr.setRequestHeader("Authorization", `Bearer ${session.accessToken}`);
      putXhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      putXhr.onload = () => {
        if (putXhr.status >= 200 && putXhr.status < 300) resolve();
        else reject(new Error("Nem sikerült feltölteni a fájlt a Drive-ra"));
      };
      putXhr.onerror = () => reject(new Error("Hálózati hiba a feltöltés közben"));
      putXhr.send(file);
    };
    initXhr.onerror = () => reject(new Error("Hálózati hiba a feltöltés indításakor"));
    initXhr.send(JSON.stringify({ name: filename, parents: [session.folderId] }));
  });
}
