import { authFetch } from "./api";

export interface Profile {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
  created_at: string;
}

export async function getMe(token: string): Promise<Profile> {
  const res = await authFetch(token, "/me");
  const data = await res.json();
  return data.user;
}

export async function updateMyName(token: string, name: string): Promise<Profile> {
  const res = await authFetch(token, "/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json();
  return data.user;
}

export async function uploadMyAvatar(token: string, dataUrl: string): Promise<void> {
  await authFetch(token, "/me/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
}

export async function fetchAvatarBlobUrl(token: string, userId: number, version = 0): Promise<string | null> {
  try {
    // A verziószámot query paraméterként adjuk hozzá, hogy feltöltés után
    // ne szolgálja ki a böngésző a gyorsítótárazott (régi) képet.
    const res = await authFetch(token, `/users/${userId}/avatar?v=${version}`);
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// Kliens oldalon átméretezi a kiválasztott képet, hogy a feltöltés
// kicsi és gyors maradjon, ne kelljen a szervernek nagy fájlokkal bajlódnia.
export async function resizeImageToDataUrl(file: File, maxSize = 256, quality = 0.85): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas nem elérhető");
  ctx.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/jpeg", quality);
}
