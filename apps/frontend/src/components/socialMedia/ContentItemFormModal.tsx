import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import type { Client } from "../../lib/clients";
import { getClientOnboarding } from "../../lib/clientOnboarding";
import { PLATFORM_LABELS, type ContentType, type Platform } from "../../lib/socialMedia";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ContentItemFormModalProps {
  clients: Client[];
  onClose: () => void;
  onSave: (input: {
    clientId: number;
    title: string;
    contentType: ContentType;
    platform: Platform;
    assignedTo?: number;
  }) => Promise<void>;
}

// TikTok/YouTube-on nincs "képes poszt" — csak videó értelmes rájuk.
const IMAGE_CAPABLE_PLATFORMS: Platform[] = ["facebook", "instagram"];

// A cím ("Munkacím – {mai dátum}") csak egy ésszerű alapérték, hogy a
// backend title-mezője kitöltve legyen — a részletes nézetben utólag
// szabadon átírható, ahogy a script/forgatás dátum is.
function defaultTitle(): string {
  const dateLabel = new Date().toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
  return `Tartalom – ${dateLabel}`;
}

// A Clippelés ide nem tartozik — annál nincs egyenként létrehozott
// tartalom, a kész klippek számát a rendszer a havi Drive-mappából
// olvassa (lásd Állapot fül) — itt csak a "sima" (script→forgatás→vágás
// vagy poszt-tervezés) tartalomgyártási út érhető el.
export default function ContentItemFormModal({ clients, onClose, onSave }: ContentItemFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [clientId, setClientId] = useState<number | "">(clients[0]?.id ?? "");
  const [enabledPlatforms, setEnabledPlatforms] = useState<Platform[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [platform, setPlatform] = useState<Platform | "">("");
  const [contentType, setContentType] = useState<ContentType>("video");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId === "" && clients[0]) setClientId(clients[0].id);
  }, [clients, clientId]);

  // Csak azok a platformok jelennek meg, amikre az ügyfélnél az
  // Onboarding "Amit vállalunk nekik" alatt tényleg vállaltunk munkát —
  // nem az összes lehetséges platform mindenkinél.
  useEffect(() => {
    if (!token || clientId === "") return;
    setLoadingProfile(true);
    getClientOnboarding(token, clientId)
      .then((profile) => {
        const platforms: Platform[] = [
          profile?.platform_facebook && "facebook",
          profile?.platform_instagram && "instagram",
          profile?.platform_tiktok && "tiktok",
          profile?.platform_youtube && "youtube",
        ].filter((p): p is Platform => Boolean(p));
        setEnabledPlatforms(platforms);
        setPlatform(platforms[0] ?? "");
      })
      .finally(() => setLoadingProfile(false));
  }, [token, clientId]);

  // Ha olyan platformra váltunk, ahol nincs "képes poszt", a típust
  // automatikusan videóra állítjuk.
  useEffect(() => {
    if (platform && !IMAGE_CAPABLE_PLATFORMS.includes(platform) && contentType === "image_post") {
      setContentType("video");
    }
  }, [platform, contentType]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (clientId === "" || !platform) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ clientId, title: defaultTitle(), contentType, platform });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni a tartalmat");
      setSaving(false);
    }
  }

  const noPlatforms = !loadingProfile && enabledPlatforms.length === 0;

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>Új tartalom</h2>

        {clients.length === 0 ? (
          <p className="chat-empty-hint">Nincs még felvett ügyfél — előbb vegyél fel egyet az Ügyfelek modulban.</p>
        ) : (
          <>
            <label htmlFor="ci-client">Ügyfél</label>
            <select id="ci-client" value={clientId} onChange={(e) => setClientId(Number(e.currentTarget.value))} autoFocus>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.company_name}
                </option>
              ))}
            </select>

            {loadingProfile && <p className="chat-empty-hint">Betöltés...</p>}

            {noPlatforms && (
              <p className="chat-empty-hint">
                Ennél az ügyfélnél nincs beállítva social media platform az Onboardingnál — ha csak Clippelés van
                beállítva, annál nincs itt létrehozandó tartalom, a kész klippek száma az Állapot fülön látszik.
                Állítsd be a platformokat az Ügyfelek &gt; Onboarding "Amit vállalunk nekik" részén.
              </p>
            )}

            {!loadingProfile && enabledPlatforms.length > 0 && (
              <>
                <label htmlFor="ci-platform">Platform</label>
                <select id="ci-platform" value={platform} onChange={(e) => setPlatform(e.currentTarget.value as Platform)}>
                  {enabledPlatforms.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>

                <label htmlFor="ci-content-type">Típus</label>
                <select
                  id="ci-content-type"
                  value={contentType}
                  onChange={(e) => setContentType(e.currentTarget.value as ContentType)}
                >
                  <option value="video">Videó</option>
                  {platform && IMAGE_CAPABLE_PLATFORMS.includes(platform) && (
                    <option value="image_post">Képes poszt</option>
                  )}
                </select>
              </>
            )}
          </>
        )}

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving || clients.length === 0 || noPlatforms || !platform}>
            {saving ? "Létrehozás..." : "Létrehozás"}
          </button>
        </div>
      </form>
    </div>
  );
}
