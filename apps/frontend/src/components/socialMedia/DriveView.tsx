import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { browseDrive, createDriveDoc, type DriveBrowseResult, type DriveItem } from "../../lib/socialMedia";

// A natív Google Docs/Sheets/Slides-fájloknak van szerkeszthető beágyazott
// nézete (docs.google.com/.../edit — a Google ezt engedélyezi iframe-ben,
// ellentétben a teljes Drive-mappaböngészővel). Minden másnál (videó, kép,
// PDF stb.) csak a sima, olvasható előnézet létezik.
function embedUrl(item: DriveItem): string {
  switch (item.mimeType) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${item.id}/edit`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${item.id}/edit`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${item.id}/edit`;
    default:
      return `https://drive.google.com/file/d/${item.id}/preview`;
  }
}

// Beépített, az "Ügyfelek" mappára korlátozott Drive-böngésző — a backend
// garantálja, hogy egyik mappa se legyen ezen kívül elérhető, így itt nem
// kell külön ellenőrizni. A fájlok Google beágyazott nézetben nyílnak meg
// (iframe), sosem lép ki az alkalmazásból a felhasználó.
export default function DriveView() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<DriveBrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<DriveItem | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    browseDrive(token, folderId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Nem sikerült betölteni a Drive-mappát"))
      .finally(() => setLoading(false));
  }, [token, folderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateDoc() {
    if (!token || !data) return;
    const name = prompt("A dokumentum neve:");
    if (!name?.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const file = await createDriveDoc(token, data.folderId, name.trim());
      load();
      setOpenItem(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni a dokumentumot");
    } finally {
      setCreating(false);
    }
  }

  if (openItem) {
    return (
      <div className="sm-drive-preview">
        <button type="button" className="sm-detail-back" onClick={() => setOpenItem(null)}>
          ← Vissza
        </button>
        <h2 className="sm-drive-preview-title">{openItem.name}</h2>
        <iframe src={embedUrl(openItem)} className="sm-drive-preview-frame" allow="autoplay" title={openItem.name} />
      </div>
    );
  }

  return (
    <div className="sm-drive-view">
      <div className="sm-drive-toolbar">
        {data && (
          <div className="sm-drive-breadcrumb">
            {data.breadcrumb.map((entry, i) => (
              <span key={entry.id}>
                {i > 0 && <span className="sm-drive-breadcrumb-sep">/</span>}
                <button
                  type="button"
                  className="sm-drive-breadcrumb-item"
                  disabled={i === data.breadcrumb.length - 1}
                  onClick={() => setFolderId(entry.id === data.breadcrumb[0].id ? undefined : entry.id)}
                >
                  {entry.name}
                </button>
              </span>
            ))}
          </div>
        )}
        {data && (
          <button type="button" disabled={creating} onClick={handleCreateDoc}>
            {creating ? "Létrehozás..." : "+ Új Google Dokumentum"}
          </button>
        )}
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {error && <p className="login-error">{error}</p>}

      {!loading && !error && data && (
        <ul className="sm-drive-list">
          {data.folders.map((folder) => (
            <li key={folder.id}>
              <button type="button" className="sm-drive-item sm-drive-item-folder" onClick={() => setFolderId(folder.id)}>
                📁 {folder.name}
              </button>
            </li>
          ))}
          {data.files.map((file) => (
            <li key={file.id}>
              <button type="button" className="sm-drive-item" onClick={() => setOpenItem(file)}>
                📄 {file.name}
              </button>
            </li>
          ))}
          {data.folders.length === 0 && data.files.length === 0 && (
            <p className="chat-empty-hint">Ez a mappa üres.</p>
          )}
        </ul>
      )}
    </div>
  );
}
