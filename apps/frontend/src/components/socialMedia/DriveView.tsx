import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "../../lib/auth";
import {
  DRIVE_CREATE_KIND_LABELS,
  browseDrive,
  createDriveItem,
  deleteDriveItem,
  renameDriveItem,
  uploadDriveFiles,
  type DriveBrowseResult,
  type DriveCreateKind,
  type DriveItem,
} from "../../lib/socialMedia";

const CREATE_KINDS: DriveCreateKind[] = ["folder", "document", "spreadsheet", "presentation"];

// Az appon belüli előnézet mindig az olvasható /preview beágyazást
// használja — a docs.google.com/.../edit szerkesztőt a Tauri webview nem
// tudja megnyitni (a Google bejelentkezéséhez szükséges felugró ablakot a
// webview blokkolja, emiatt a cookie-engedélyezés soha nem zárul le).
function previewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

// Szerkesztéshez natív Google Docs/Sheets/Slides-fájloknál egy külső
// böngészőben kell megnyitni — ott a felugró ablakos bejelentkezés
// zökkenőmentesen működik. Minden másnál (videó, kép, PDF stb.) nincs
// "szerkesztés" fogalom, null-t adunk vissza.
function editUrl(item: DriveItem): string | null {
  switch (item.mimeType) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${item.id}/edit`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${item.id}/edit`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${item.id}/edit`;
    default:
      return null;
  }
}

// Beépített, az "Ügyfelek" mappára korlátozott Drive-böngésző — a backend
// garantálja, hogy egyik mappa se legyen ezen kívül elérhető, így itt nem
// kell külön ellenőrizni. A fájlok beágyazott előnézetben nyílnak meg
// (iframe) — szerkesztéshez (Docs/Sheets/Slides) egy külön gomb nyitja meg
// külső böngészőben, mert a Tauri webview blokkolja a Google
// bejelentkezéséhez szükséges felugró ablakot.
export default function DriveView() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<DriveBrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<DriveItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!createMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(e.target as Node)) setCreateMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [createMenuOpen]);

  useEffect(() => {
    if (!openRowMenuId) return;
    function handleClickOutside(e: MouseEvent) {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) setOpenRowMenuId(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openRowMenuId]);

  async function handleCreate(kind: DriveCreateKind) {
    setCreateMenuOpen(false);
    if (!token || !data) return;
    const name = prompt(`${DRIVE_CREATE_KIND_LABELS[kind]} neve:`);
    if (!name?.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const file = await createDriveItem(token, data.folderId, name.trim(), kind);
      load();
      if (kind !== "folder") setOpenItem(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni");
    } finally {
      setCreating(false);
    }
  }

  async function handleRename(item: DriveItem) {
    setOpenRowMenuId(null);
    if (!token) return;
    const name = prompt("Új név:", item.name);
    if (!name?.trim() || name.trim() === item.name) return;
    setError(null);
    try {
      await renameDriveItem(token, item.id, name.trim());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült átnevezni");
    }
  }

  async function handleDelete(item: DriveItem) {
    setOpenRowMenuId(null);
    if (!token) return;
    if (!confirm(`Biztosan kukába dobod: "${item.name}"?`)) return;
    setError(null);
    try {
      await deleteDriveItem(token, item.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült törölni");
    }
  }

  async function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (!token || !data || files.length === 0) return;
    setUploadProgress(0);
    setError(null);
    try {
      await uploadDriveFiles(token, data.folderId, files, setUploadProgress);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat");
    } finally {
      setUploadProgress(null);
    }
  }

  function renderRowMenu(item: DriveItem) {
    const isOpen = openRowMenuId === item.id;
    return (
      <div className="sm-drive-row-menu" ref={isOpen ? rowMenuRef : undefined}>
        <button
          type="button"
          className="sm-drive-row-menu-toggle"
          onClick={() => setOpenRowMenuId(isOpen ? null : item.id)}
        >
          ⋮
        </button>
        {isOpen && (
          <ul className="sm-drive-create-menu">
            <li>
              <button type="button" onClick={() => handleRename(item)}>
                Átnevezés
              </button>
            </li>
            <li>
              <button type="button" onClick={() => handleDelete(item)}>
                Törlés
              </button>
            </li>
          </ul>
        )}
      </div>
    );
  }

  if (openItem) {
    const edit = editUrl(openItem);
    return (
      <div className="sm-drive-preview">
        <div className="sm-drive-preview-header">
          <button type="button" className="sm-detail-back" onClick={() => setOpenItem(null)}>
            ← Vissza
          </button>
          {edit && (
            <a href={edit} target="_blank" rel="noreferrer" className="sm-drive-edit-link">
              Megnyitás szerkesztésre (böngészőben)
            </a>
          )}
        </div>
        <h2 className="sm-drive-preview-title">{openItem.name}</h2>
        <iframe src={previewUrl(openItem.id)} className="sm-drive-preview-frame" allow="autoplay" title={openItem.name} />
      </div>
    );
  }

  return (
    <div className="sm-drive-view">
      <input ref={uploadInputRef} type="file" multiple hidden onChange={handleFilesSelected} />
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
          <div className="sm-drive-toolbar-actions">
            <button type="button" disabled={uploadProgress != null} onClick={() => uploadInputRef.current?.click()}>
              {uploadProgress != null ? `Feltöltés... ${Math.round(uploadProgress * 100)}%` : "Fájlok feltöltése"}
            </button>
            <div className="sm-drive-create" ref={createMenuRef}>
              <button type="button" disabled={creating} onClick={() => setCreateMenuOpen((v) => !v)}>
                {creating ? "Létrehozás..." : "+ Új..."}
              </button>
              {createMenuOpen && (
                <ul className="sm-drive-create-menu">
                  {CREATE_KINDS.map((kind) => (
                    <li key={kind}>
                      <button type="button" onClick={() => handleCreate(kind)}>
                        {DRIVE_CREATE_KIND_LABELS[kind]}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {loading && <p className="chat-empty-hint">Betöltés...</p>}
      {error && <p className="login-error">{error}</p>}

      {!loading && !error && data && (
        <ul className="sm-drive-list">
          {data.folders.map((folder) => (
            <li key={folder.id} className="sm-drive-row">
              <button
                type="button"
                className="sm-drive-item sm-drive-item-folder"
                onClick={() => setFolderId(folder.id)}
              >
                📁 {folder.name}
              </button>
              {renderRowMenu(folder)}
            </li>
          ))}
          {data.files.map((file) => (
            <li key={file.id} className="sm-drive-row">
              <button type="button" className="sm-drive-item" onClick={() => setOpenItem(file)}>
                📄 {file.name}
              </button>
              {renderRowMenu(file)}
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
