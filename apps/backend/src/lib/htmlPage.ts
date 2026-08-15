// Közös, egyszerű HTML-oldal-keret a publikus (nem Tauri-appból nyitott)
// végpontokhoz — pl. a Social Media jóváhagyó link és a Google Naptár OAuth
// callback. Szándékosan szerver-renderelt, kliens-JS nélküli sima HTML.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 560px; margin: 3em auto; padding: 0 1.2em; color: #1a1a1a; background: #fafafa; line-height: 1.5; }
  h1 { font-size: 1.35em; }
  .sm-meta { color: #666; font-size: 0.9em; margin-bottom: 1.2em; }
  .sm-snapshot { white-space: pre-wrap; background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 1em; margin: 1em 0; }
  .sm-video-link { display: inline-block; padding: 0.7em 1.2em; background: #2f7fe0; color: #fff; text-decoration: none; border-radius: 6px; margin: 0.4em 0 1.2em; }
  label { display: block; font-weight: 600; margin-bottom: 0.3em; font-size: 0.92em; }
  input[type=text], textarea { width: 100%; padding: 0.6em; margin: 0 0 1em; border: 1px solid #ccc; border-radius: 6px; font-family: inherit; font-size: 1em; box-sizing: border-box; }
  button { padding: 0.75em 1.4em; border: none; border-radius: 6px; font-size: 1em; cursor: pointer; margin-right: 0.6em; margin-bottom: 0.6em; }
  button[value=approve] { background: #2f7fe0; color: #fff; }
  button[value=reject] { background: #e6e6e6; color: #333; }
  .sm-card { background: #fff; border: 1px solid #e2e2e2; border-radius: 10px; padding: 1.2em 1.4em; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function infoPage(message: string): string {
  return renderPage("RunMate CRM", `<div class="sm-card"><p>${escapeHtml(message)}</p></div>`);
}
