import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { useRealtime } from "../../lib/realtime";
import { getMe, resizeImageToDataUrl, updateMyPhone, uploadMyAvatar } from "../../lib/profile";
import Avatar from "../Avatar";
import PersonalGoogleDriveSettings from "./PersonalGoogleDriveSettings";
import GoogleIntegrationSettings from "./GoogleIntegrationSettings";

export default function ProfileSettings() {
  const { auth, updateName } = useAuth();
  const { bumpAvatar } = useRealtime();
  const [name, setName] = useState(auth?.user.name ?? "");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedHint, setSavedHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!auth) return;
    getMe(auth.token).then((me) => setPhone(me.phone ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  if (!auth) return null;

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!auth || !name.trim()) return;
    setSaving(true);
    setError(null);
    setSavedHint(false);
    try {
      await updateName(name.trim());
      await updateMyPhone(auth.token, phone.trim());
      setSavedHint(true);
      setTimeout(() => setSavedHint(false), 2500);
    } catch {
      setError("Nem sikerült menteni az adatokat.");
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

      <form className="profile-name-form" onSubmit={handleSaveProfile}>
        <label htmlFor="profile-name">Keresztnév</label>
        <input id="profile-name" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        <label htmlFor="profile-phone">Telefonszám</label>
        <input
          id="profile-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.currentTarget.value)}
          placeholder="+36 30 123 4567"
        />
        <p className="chat-modal-hint">
          Ezt látják a kollégáid, ha rákattintanak az avatárodra — így el tudnak érni, ha szükséges.
        </p>
        <button type="submit" disabled={saving}>
          {saving ? "Mentés..." : "Mentés"}
        </button>
        {savedHint && <span className="profile-saved-hint">Mentve ✓</span>}
      </form>

      {error && <p className="login-error">{error}</p>}

      <PersonalGoogleDriveSettings />

      {auth.user.role === "admin" && <GoogleIntegrationSettings />}
    </div>
  );
}
