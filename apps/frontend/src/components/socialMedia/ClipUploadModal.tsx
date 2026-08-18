import { useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { uploadClippingClip, type ClippingProgress } from "../../lib/clippingProgress";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClipUploadModalProps {
  clientId: number;
  clientName: string;
  onClose: () => void;
  onUploaded: (progress: ClippingProgress) => void;
}

// A vágó itt tölti fel a kész klipet — a szerver a saját Drive-fiókjával
// írja fel a fájlt a megfelelő névre ("1", "2", felülvágásnál "1v2" stb.),
// így nem kell kézzel elnevezgetni, és garantáltan látható/számolható lesz
// a progress-számlálóban, függetlenül attól, ki tölti fel.
export default function ClipUploadModal({ clientId, clientName, onClose, onUploaded }: ClipUploadModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [clipNumber, setClipNumber] = useState("");
  const [version, setVersion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !file || !clipNumber) return;
    setUploading(true);
    setError(null);
    try {
      const progress = await uploadClippingClip(token, clientId, Number(clipNumber), version ? Number(version) : null, file);
      onUploaded(progress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült feltölteni a fájlt");
      setUploading(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal" onSubmit={handleSubmit}>
        <h2>Klip feltöltése — {clientName}</h2>

        <label htmlFor="clip-number">Hányadik videó?</label>
        <input
          id="clip-number"
          type="number"
          min={1}
          value={clipNumber}
          onChange={(e) => setClipNumber(e.currentTarget.value)}
          autoFocus
          required
        />

        <label htmlFor="clip-version">Verzió (csak felülvágásnál — pl. 2)</label>
        <input
          id="clip-version"
          type="number"
          min={2}
          value={version}
          onChange={(e) => setVersion(e.currentTarget.value)}
          placeholder="Üresen hagyva: első/eredeti verzió"
        />

        <label htmlFor="clip-file">Videófájl</label>
        <input
          id="clip-file"
          type="file"
          accept="video/*"
          onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
          required
        />

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={uploading}>
            Mégse
          </button>
          <button type="submit" disabled={uploading || !file || !clipNumber}>
            {uploading ? "Feltöltés..." : "Feltöltés"}
          </button>
        </div>
      </form>
    </div>
  );
}
