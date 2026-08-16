// Alap weboldal-elérhetőségi ellenőrzés — semmilyen API-kulcsot nem igényel,
// sima fetch. A részletesebb elemzés (PageSpeed sebesség/SEO/mobil-pontszám)
// a C fázisban kerül be, amikor a Google Cloud API-kulcs rendelkezésre áll.
export async function checkWebsite(url: string): Promise<string> {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const elapsedMs = Date.now() - start;
    const isHttps = res.url.startsWith("https://");
    return [
      `URL: ${res.url}`,
      `Elérhető: igen (HTTP ${res.status})`,
      `HTTPS: ${isHttps ? "igen" : "NEM — ez érdemes megemlíteni"}`,
      `Válaszidő: kb. ${elapsedMs} ms`,
    ].join("\n");
  } catch (err) {
    return `Elérhető: NEM (${err instanceof Error ? err.message : "ismeretlen hiba"})`;
  }
}
