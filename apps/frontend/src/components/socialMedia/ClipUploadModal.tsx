import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useAuth } from "../../lib/auth";
import { uploadClippingClip, type ClippingProgress } from "../../lib/clippingProgress";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClipUploadModalProps {
  clientId: number;
  clientName: string;
  nextClipNumber: number | null;
  onClose: () => void;
  onUploaded: (progress: ClippingProgress) => void;
  onProgressUpdate: (progress: ClippingProgress) => void;
}

// A vágó ide dobja be a kész klipeket — a fájlneveket nem kell kézzel
// megadni, a rendszer a mappa jelenlegi állása alapján automatikusan,
// sorban elnevezi és felírja őket a feltöltéskor (lásd
// lib/clipping.ts uploadNumberedClip). Itt csak a kiválasztás és a
// tényleges "Feltöltés" gomb választja szét a két lépést, hogy még
// meggondolhassa magát a felhasználó.
export default function ClipUploadModal({
  clientId,
  clientName,
  nextClipNumber,
  onClose,
  onUploaded,
  onProgressUpdate,
}: ClipUploadModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [files, setFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [progressByIndex, setProgressByIndex] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(newFiles: File[]) {
    const videos = newFiles.filter((f) => f.type.startsWith("video/"));
    if (videos.length > 0) setFiles((prev) => [...prev, ...videos]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    addFiles(Array.from(e.currentTarget.files ?? []));
    e.currentTarget.value = "";
  }

  // A Tauri ablak dragDropEnabled beállítása false — enélkül a natív
  // ablak-réteg elkapná a fájl-dobást, mielőtt a webview HTML5 drag/drop
  // eseményei egyáltalán lefutnának.
  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDraggingOver(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDraggingOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  }

  // A szerver a mappa aktuális állása alapján adja ki a következő
  // sorszámot, ezért a klipek csak szigorúan egymás után, egyenként
  // tölthetők fel — a következő csak akkor indul, ha az előző teljesen
  // lezárult (nincs párhuzamos feltöltés, nincs sorrendcsere).
  async function handleUpload() {
    if (!token || files.length === 0) return;
    setUploading(true);
    setError(null);

    let lastProgress: ClippingProgress | null = null;
    let completed = 0;
    for (let i = 0; i < files.length; i++) {
      setActiveIndex(i);
      try {
        const result = await uploadClippingClip(token, clientId, files[i], (pct) => {
          setProgressByIndex((prev) => ({ ...prev, [i]: pct }));
        });
        lastProgress = result.progress;
        onProgressUpdate(result.progress);
        completed++;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat");
        setUploading(false);
        setActiveIndex(null);
        setProgressByIndex({});
        setFiles((prev) => prev.slice(completed));
        return;
      }
    }

    setUploading(false);
    setActiveIndex(null);
    setProgressByIndex({});
    setFiles([]);
    if (lastProgress) onUploaded(lastProgress);
  }

  const previewNumbers =
    nextClipNumber != null ? files.map((_, i) => nextClipNumber + i) : files.map(() => null);

  return (
    <div className="chat-modal-backdrop">
      <div className="chat-modal sm-clip-upload-modal">
        <h2>Klipek feltöltése — {clientName}</h2>

        <div
          className={`sm-clip-dropzone${isDraggingOver ? " sm-clip-dropzone-dragover" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept="video/*" multiple hidden onChange={handleFileInput} />
          <p>Húzd ide a kész videókat, vagy kattints a tallózáshoz</p>
          <p className="chat-empty-hint">A fájlnevek automatikusan sorszámozódnak, sorban töltődnek fel</p>
        </div>

        {files.length > 0 && (
          <ul className="sm-clip-file-list">
            {files.map((file, i) => {
              const pct = progressByIndex[i] ?? 0;
              const isActive = activeIndex === i;
              const isDone = uploading && activeIndex != null && i < activeIndex;
              return (
                <li key={`${file.name}-${i}`} className="sm-clip-file-item">
                  <div className="sm-clip-file-row">
                    <span className="sm-clip-file-number">{previewNumbers[i] ?? "?"}.</span>
                    <span className="sm-clip-file-name">{file.name}</span>
                    {isDone && <span className="sm-clip-file-done">Kész</span>}
                    {!uploading && (
                      <button
                        type="button"
                        className="sm-clip-file-remove"
                        onClick={() => removeFile(i)}
                        aria-label="Eltávolítás"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {isActive && (
                    <div className="sm-clip-progress-track">
                      <div className="sm-clip-progress-fill" style={{ width: `${pct}%` }} />
                      <span className="sm-clip-progress-label">{pct}%</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={uploading}>
            Mégse
          </button>
          <button type="button" className="ob-submit-btn" onClick={() => void handleUpload()} disabled={uploading || files.length === 0}>
            {uploading ? `Feltöltés... (${(activeIndex ?? 0) + 1}/${files.length})` : `Feltöltés (${files.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
