import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { useRealtime } from "../../lib/realtime";
import { resizeImageToDataUrl, uploadMyAvatar } from "../../lib/profile";
import Avatar from "../Avatar";

export default function ProfileSettings() {
  const { auth, updateName } = useAuth();
  const { bumpAvatar } = useRealtime();
  const [name, setName] = useState(auth?.user.name ?? "");
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!auth) return null;

  async function handleSaveName(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setSavedHint(false);
    try {
      await updateName(name.trim());
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 2500);
    } catch {
      setError("Nem sikerült menteni a nevet.");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !auth) return;
    setUploading(true);
    setError(null);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await uploadMyAvatar(auth.token, dataUrl);
      bumpAvatar(auth.user.id);
    } catch {
      setError("Nem sikerült feltölteni a profilképet.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="profile-settings">
      <h1>Profilom</h1>

      <div className="profile-avatar-row">
        <Avatar userId={auth.user.id} name={auth.user.name} size={72} />
        <div>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? "Feltöltés..." : "Kép feltöltése"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="profile-file-input"
            onChange={handleFileChange}
          />
          <p className="profile-avatar-hint">
            Ajánlott méret: legalább 256×256 px (négyzet alakú kép a legjobb). A nagyobb képeket
            automatikusan kicsinyítjük.
          </p>
        </div>
      </div>

      <form className="profile-name-form" onSubmit={handleSaveName}>
        <label htmlFor="profile-name">Keresztnév</label>
        <input id="profile-name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <button type="submit" disabled={saving}>
          {saving ? "Mentés..." : "Mentés"}
        </button>
        {savedHint && <span className="profile-saved-hint">Mentve ✓</span>}
      </form>

      {error && <p className="login-error">{error}</p>}
    </div>
  );
}
