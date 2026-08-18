import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useAuth } from "../../lib/auth";
import { uploadClippingClips, type ClippingProgress } from "../../lib/clippingProgress";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClipUploadModalProps {
  clientId: number;
  clientName: string;
  nextClipNumber: number | null;
  onClose: () => void;
  onUploaded: (progress: ClippingProgress) => void;
}

// A vágó ide dobja be a kész klipeket — a fájlneveket nem kell kézzel
// megadni, a rendszer a mappa jelenlegi állása alapján automatikusan,
// sorban elnevezi és felírja őket a feltöltéskor (lásd
// lib/clipping.ts uploadNumberedClip). Itt csak a kiválasztás és a
// tényleges "Feltöltés" gomb választja szét a két lépést, hogy még
// meggondolhassa magát a felhasználó.
export default function ClipUploadModal({ clientId, clientName, nextClipNumber, onClose, onUploaded }: ClipUploadModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [files, setFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  async function handleUpload() {
    if (!token || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadClippingClips(token, clientId, files);
      onUploaded(result.progress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlokat");
      setUploading(false);
    }
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
          <p className="chat-empty-hint">A fájlnevek automatikusan sorszámozódnak feltöltéskor</p>
        </div>

        {files.length > 0 && (
          <ul className="sm-clip-file-list">
            {files.map((file, i) => (
              <li key={`${file.name}-${i}`}>
                <span className="sm-clip-file-number">{previewNumbers[i] ?? "?"}.</span>
                <span className="sm-clip-file-name">{file.name}</span>
                <button
                  type="button"
                  className="sm-clip-file-remove"
                  onClick={() => removeFile(i)}
                  disabled={uploading}
                  aria-label="Eltávolítás"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={uploading}>
            Mégse
          </button>
          <button type="button" className="ob-submit-btn" onClick={() => void handleUpload()} disabled={uploading || files.length === 0}>
            {uploading ? "Feltöltés..." : `Feltöltés (${files.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
