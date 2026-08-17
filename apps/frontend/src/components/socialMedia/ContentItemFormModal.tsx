import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { getClientAiProfile, type Client } from "../../lib/clients";
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
    startAsClip?: boolean;
  }) => Promise<void>;
}

// TikTok/YouTube-on nincs "képes poszt" — csak videó értelmes rájuk.
const IMAGE_CAPABLE_PLATFORMS: Platform[] = ["facebook", "instagram"];
const ALL_PLATFORMS: Platform[] = ["instagram", "tiktok", "youtube", "facebook"];

// A cím ("Munkacím – {mai dátum}") csak egy ésszerű alapérték, hogy a
// backend title-mezője kitöltve legyen — a részletes nézetben utólag
// szabadon átírható, ahogy a script/forgatás dátum is.
function defaultTitle(): string {
  const dateLabel = new Date().toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
  return `Tartalom – ${dateLabel}`;
}

export default function ContentItemFormModal({ clients, onClose, onSave }: ContentItemFormModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [clientId, setClientId] = useState<number | "">(clients[0]?.id ?? "");
  const [enabledPlatforms, setEnabledPlatforms] = useState<Platform[]>([]);
  const [clippingAvailable, setClippingAvailable] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [platform, setPlatform] = useState<Platform | "">("");
  const [contentType, setContentType] = useState<ContentType>("video");
  const [startAsClip, setStartAsClip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId === "" && clients[0]) setClientId(clients[0].id);
  }, [clients, clientId]);

  // Csak azok a platformok/szolgáltatások jelennek meg, amikre az ügyfélnél
  // a Szolgáltatások alatt tényleg vállaltunk munkát — nem az összes
  // lehetséges platform mindenkinél.
  useEffect(() => {
    if (!token || clientId === "") return;
    setLoadingProfile(true);
    getClientAiProfile(token, clientId)
      .then((profile) => {
        const platforms: Platform[] = [
          profile?.platform_facebook && "facebook",
          profile?.platform_instagram && "instagram",
          profile?.platform_tiktok && "tiktok",
          profile?.platform_youtube && "youtube",
        ].filter((p): p is Platform => Boolean(p));
        const isClippingAvailable = Boolean(profile?.service_clipping && profile.clipping_source_folder_url);
        setEnabledPlatforms(platforms);
        setClippingAvailable(isClippingAvailable);
        // Clippelés bármelyik platformra célozhat, függetlenül attól, hogy
        // van-e külön bepipálva social platform szolgáltatás is — ilyenkor
        // a teljes listát ajánljuk fel, hogy a vágó jelölhesse, hova készül.
        const options = platforms.length > 0 ? platforms : isClippingAvailable ? ALL_PLATFORMS : [];
        setPlatform(options[0] ?? "");
        // Ha csak Clippelés van beállítva (nincs külön social platform
        // szolgáltatás), nincs értelmes "sima" videó/kép-gyártási út —
        // ilyenkor eleve Clippelés-ként induljon, ne kelljen külön pipálni.
        setStartAsClip(platforms.length === 0 && isClippingAvailable);
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
      await onSave({
        clientId,
        title: defaultTitle(),
        contentType,
        platform,
        startAsClip: startAsClip || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült létrehozni a tartalmat");
      setSaving(false);
    }
  }

  const noServices = !loadingProfile && enabledPlatforms.length === 0 && !clippingAvailable;
  const platformOptions = enabledPlatforms.length > 0 ? enabledPlatforms : clippingAvailable ? ALL_PLATFORMS : [];

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

            {noServices && (
              <p className="chat-empty-hint">
                Ennél az ügyfélnél nincs beállítva egyetlen tartalom-szolgáltatás sem — állítsd be az Ügyfelek &gt;
                AI-profil "Szolgáltatások" részén.
              </p>
            )}

            {!loadingProfile && platformOptions.length > 0 && (
              <>
                <label htmlFor="ci-platform">Platform</label>
                <select
                  id="ci-platform"
                  value={platform}
                  onChange={(e) => setPlatform(e.currentTarget.value as Platform)}
                >
                  {platformOptions.map((p) => (
                    <option key={p} value={p}>
                      {PLATFORM_LABELS[p]}
                    </option>
                  ))}
                </select>

                {!startAsClip && (
                  <>
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

            {!loadingProfile && clippingAvailable && enabledPlatforms.length === 0 && (
              <p className="chat-empty-hint">
                Ennél az ügyfélnél csak Clippelés van beállítva — a tartalom egyenesen "Vágásra vár" állapotban indul.
              </p>
            )}

            {!loadingProfile && clippingAvailable && enabledPlatforms.length > 0 && (
              <label className="ai-profile-checkbox">
                <input
                  type="checkbox"
                  checked={startAsClip}
                  onChange={(e) => {
                    setStartAsClip(e.currentTarget.checked);
                    if (e.currentTarget.checked) setContentType("video");
                  }}
                />
                Clippelés (kész nyersanyagból, egyenesen "Vágásra vár" állapotban indul)
              </label>
            )}
          </>
        )}

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving || clients.length === 0 || noServices || !platform}>
            {saving ? "Létrehozás..." : "Létrehozás"}
          </button>
        </div>
      </form>
    </div>
  );
}
