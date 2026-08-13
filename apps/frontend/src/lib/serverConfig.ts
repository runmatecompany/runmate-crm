const STORAGE_KEY = "runmate-crm-api-url";
const DEFAULT_API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3001";

export function getApiUrl(): string {
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_API_URL;
}

export function setApiUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, url.trim().replace(/\/+$/, ""));
}
