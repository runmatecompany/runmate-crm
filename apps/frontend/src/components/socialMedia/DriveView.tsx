import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { browseDrive, type DriveBrowseResult, type DriveItem } from "../../lib/socialMedia";

function previewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

// Beépített, az "Ügyfelek" mappára korlátozott Drive-böngésző — a backend
// garantálja, hogy egyik mappa se legyen ezen kívül elérhető, így itt nem
// kell külön ellenőrizni. A fájlok Google beágyazott előnézetben nyílnak meg
// (iframe), sosem lép ki az alkalmazásból a felhasználó.
export default function DriveView() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<DriveBrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<DriveItem | null>(null);

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

  if (previewItem) {
    return (
      <div className="sm-drive-preview">
        <button type="button" className="sm-detail-back" onClick={() => setPreviewItem(null)}>
          ← Vissza
        </button>
        <h2 className="sm-drive-preview-title">{previewItem.name}</h2>
        <iframe
          src={previewUrl(previewItem.id)}
          className="sm-drive-preview-frame"
          allow="autoplay"
          title={previewItem.name}
        />
      </div>
    );
  }

  return (
    <div className="sm-drive-view">
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
              <button type="button" className="sm-drive-item" onClick={() => setPreviewItem(file)}>
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
