import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAuth } from "../../lib/auth";
import {
  DRIVE_CREATE_KIND_LABELS,
  browseDrive,
  createDriveFolderWithItems,
  createDriveItem,
  deleteDriveItem,
  downloadDriveZip,
  renameDriveItem,
  uploadDriveFiles,
  type DriveBrowseResult,
  type DriveCreateKind,
  type DriveItem,
} from "../../lib/socialMedia";

const CREATE_KINDS: DriveCreateKind[] = ["folder", "document", "spreadsheet", "presentation"];

// Ugyanez a komponens szolgálja ki a Web modul projekt-Drive-mappáját is
// (WebProjectFormModal) — csak a hívásokat kell máshova irányítani (a
// Social Media modul teljes "Ügyfelek" gyökere helyett egy adott projekt
// mappájára szűkítve). Ha nincs `api` prop, az alapértelmezett Social
// Media hívások futnak, tehát a meglévő `<DriveView />` hívási helyek
// (SocialMediaPage) változtatás nélkül működnek tovább.
export interface DriveViewApi {
  browse: (token: string, folderId?: string) => Promise<DriveBrowseResult>;
  createItem: (token: string, folderId: string, name: string, kind: DriveCreateKind) => Promise<DriveItem>;
  renameItem: (token: string, itemId: string, name: string) => Promise<DriveItem>;
  deleteItem: (token: string, itemId: string) => Promise<void>;
  uploadFiles: (
    token: string,
    folderId: string,
    files: File[],
    onProgress?: (fraction: number) => void
  ) => Promise<{ uploadedCount: number }>;
  // Opcionális — csak a fő Social Media Drive-böngészőben elérhető
  // "Kijelölés" mód (tömeges letöltés/mappába rendezés) épül rájuk; a Web
  // modul projekt-mappájának egyszerűbb api-ja ezeket nem adja meg, ott a
  // kijelölés-gomb emiatt nem is jelenik meg.
  downloadZip?: (token: string, itemIds: string[]) => Promise<Blob>;
  createFolderWithItems?: (
    token: string,
    folderId: string,
    name: string,
    itemIds: string[]
  ) => Promise<{ folder: DriveItem; movedCount: number }>;
}

const DEFAULT_DRIVE_API: DriveViewApi = {
  browse: browseDrive,
  createItem: createDriveItem,
  renameItem: renameDriveItem,
  deleteItem: deleteDriveItem,
  uploadFiles: uploadDriveFiles,
  downloadZip: downloadDriveZip,
  createFolderWithItems: createDriveFolderWithItems,
};

interface DriveViewProps {
  api?: DriveViewApi;
}

// Az appon belüli előnézet az olvasható /preview beágyazást használja —
// képnél/PDF-nél/Google Docs-nál ez cookie nélkül, "bárki a linkkel"
// jogosultsággal is működik. Videónál viszont a Google Drive előnézet
// bejelentkezést/cookie-hozzájárulást kér (2026-08-25-én kiderült: a Tauri
// webview ezt a felugró-ablakos folyamatot nem tudja végigvinni, a
// "cookie-k engedélyezése" gomb "nem lehet hozzáférni a fiókhoz" hibával
// zárul) — ezért videónál egyáltalán nem próbáljuk beágyazni, hanem
// egyből a "Megnyitás böngészőben" utat kínáljuk, ahol ez zökkenőmentes.
function previewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

function driveViewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function isVideoItem(item: DriveItem): boolean {
  return item.mimeType.startsWith("video/");
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
export default function DriveView({ api = DEFAULT_DRIVE_API }: DriveViewProps) {
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
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const canBulkAct = Boolean(api.downloadZip && api.createFolderWithItems);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    api
      .browse(token, folderId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Nem sikerült betölteni a Drive-mappát"))
      .finally(() => setLoading(false));
  }, [token, folderId, api]);

  useEffect(() => {
    load();
  }, [load]);

  // Mappaváltáskor a korábbi kijelölés már más elemekre vonatkozna — töröljük.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [folderId]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) setActionsMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [actionsMenuOpen]);

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
      const file = await api.createItem(token, data.folderId, name.trim(), kind);
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
      await api.renameItem(token, item.id, name.trim());
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
      await api.deleteItem(token, item.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült törölni");
    }
  }

  function toggleSelectionMode() {
    setSelectionMode((prev) => !prev);
    setSelectedIds(new Set());
    setActionsMenuOpen(false);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDownload() {
    setActionsMenuOpen(false);
    if (!token || !api.downloadZip || selectedIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      const blob = await api.downloadZip(token, Array.from(selectedIds));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kijelolt_fajlok.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült letölteni a fájlokat");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkCreateFolder() {
    setActionsMenuOpen(false);
    if (!token || !data || !api.createFolderWithItems || selectedIds.size === 0) return;
    const name = prompt("Az új mappa neve:");
    if (!name?.trim()) return;
    setBulkBusy(true);
    setError(null);
    try {
      await api.createFolderWithItems(token, data.folderId, name.trim(), Array.from(selectedIds));
      setSelectionMode(false);
      setSelectedIds(new Set());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni a mappát");
    } finally {
      setBulkBusy(false);
    }
  }

  async function uploadFiles(files: File[]) {
    if (!token || !data || files.length === 0) return;
    setUploadProgress(0);
    setError(null);
    try {
      await api.uploadFiles(token, data.folderId, files, setUploadProgress);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat");
    } finally {
      setUploadProgress(null);
    }
  }

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    void uploadFiles(files);
  }

  // A drag&drop csak akkor éri el ezeket a DOM-eseményeket, ha a Tauri
  // ablak dragDropEnabled beállítása false — enélkül a natív ablak-réteg
  // elkapja a fájl-dobást, mielőtt a webview HTML5 drag/drop eseményei
  // egyáltalán lefutnának.
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDraggingOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    // A gyerekelemek fölötti mozgás is drag-leave/enter párokat vált ki —
    // csak akkor kapcsoljuk ki a jelzést, ha ténylegesen elhagyta a teljes
    // konténert, nem csak egy belső elemre lépett át.
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    void uploadFiles(Array.from(e.dataTransfer.files));
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
    const video = isVideoItem(openItem);
    return (
      <div className="sm-drive-preview">
        <div className="sm-drive-preview-header">
          <button type="button" className="sm-detail-back" onClick={() => setOpenItem(null)}>
            ← Vissza
          </button>
          {edit && (
            <button type="button" className="sm-drive-edit-link" onClick={() => void openUrl(edit)}>
              Megnyitás szerkesztésre (böngészőben)
            </button>
          )}
        </div>
        <h2 className="sm-drive-preview-title">{openItem.name}</h2>
        {video ? (
          <div className="sm-drive-video-fallback">
            <p className="chat-empty-hint">
              A videó-előnézet a Google bejelentkezési korlátozás miatt nem működik az alkalmazáson belül — nyisd meg
              böngészőben a lejátszáshoz.
            </p>
            <button type="button" onClick={() => void openUrl(driveViewUrl(openItem.id))}>
              Megnyitás böngészőben
            </button>
          </div>
        ) : (
          <iframe src={previewUrl(openItem.id)} className="sm-drive-preview-frame" allow="autoplay" title={openItem.name} />
        )}
      </div>
    );
  }

  return (
    <div
      className={`sm-drive-view${isDraggingOver ? " sm-drive-view-dragover" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input ref={uploadInputRef} type="file" multiple hidden onChange={handleFilesSelected} />
      {isDraggingOver && <div className="sm-drive-dropzone-hint">Engedd el a fájlokat a feltöltéshez</div>}
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
            {canBulkAct && (
              <button type="button" onClick={toggleSelectionMode}>
                {selectionMode ? "Kijelölés megszüntetése" : "Kijelölés"}
              </button>
            )}
            {selectionMode && selectedIds.size > 0 && (
              <div className="sm-drive-create" ref={actionsMenuRef}>
                <button type="button" disabled={bulkBusy} onClick={() => setActionsMenuOpen((v) => !v)}>
                  {bulkBusy ? "Feldolgozás..." : `Műveletek (${selectedIds.size})`}
                </button>
                {actionsMenuOpen && (
                  <ul className="sm-drive-create-menu">
                    <li>
                      <button type="button" onClick={() => void handleBulkDownload()}>
                        Letöltés
                      </button>
                    </li>
                    <li>
                      <button type="button" onClick={() => void handleBulkCreateFolder()}>
                        Mappa létrehozása a kijelölt fájlokkal
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            )}
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
              {selectionMode && (
                <input
                  type="checkbox"
                  className="sm-drive-select-checkbox"
                  checked={selectedIds.has(file.id)}
                  onChange={() => toggleSelected(file.id)}
                />
              )}
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
