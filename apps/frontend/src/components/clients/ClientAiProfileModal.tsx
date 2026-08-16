import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../lib/auth";
import { getClientAiProfile, updateClientAiProfile } from "../../lib/clients";
import { useEscapeToClose } from "../../lib/useEscapeToClose";

interface ClientAiProfileModalProps {
  clientId: number;
  clientName: string;
  onClose: () => void;
}

// Ezt a profilt tölti be minden AI-vázlat-generálás a Social Media modulban
// (ContentItemDetail.tsx / Tervező "AI-vázlat generálása" gombjai) — csak
// admin szerkesztheti, mert márka-kritikus adat. Ez egyben az ügyfél-
// onboarding kérdőíve is: az első mentés jelöli az onboardingot késznek
// (lásd db/clientAiProfiles.ts upsertClientAiProfile).
export default function ClientAiProfileModal({ clientId, clientName, onClose }: ClientAiProfileModalProps) {
  useEscapeToClose(onClose);
  const { auth } = useAuth();
  const token = auth?.token ?? null;

  const [loading, setLoading] = useState(true);
  const [brandVoice, setBrandVoice] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [visualDirection, setVisualDirection] = useState("");
  const [ctaStyle, setCtaStyle] = useState("");
  const [platformNotes, setPlatformNotes] = useState("");
  const [forbiddenTopics, setForbiddenTopics] = useState("");
  const [referenceLinks, setReferenceLinks] = useState("");
  const [hasSocialPresence, setHasSocialPresence] = useState(true);
  const [inspirationBrands, setInspirationBrands] = useState("");
  const [brandMission, setBrandMission] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getClientAiProfile(token, clientId)
      .then((profile) => {
        if (!profile) return;
        setBrandVoice(profile.brand_voice ?? "");
        setTargetAudience(profile.target_audience ?? "");
        setVisualDirection(profile.visual_direction ?? "");
        setCtaStyle(profile.cta_style ?? "");
        setPlatformNotes(profile.platform_notes ?? "");
        setForbiddenTopics(profile.forbidden_topics ?? "");
        setReferenceLinks(profile.reference_links ?? "");
        setHasSocialPresence(profile.has_social_presence);
        setInspirationBrands(profile.inspiration_brands ?? "");
        setBrandMission(profile.brand_mission ?? "");
      })
      .finally(() => setLoading(false));
  }, [token, clientId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await updateClientAiProfile(token, clientId, {
        brandVoice: brandVoice.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
        visualDirection: visualDirection.trim() || undefined,
        ctaStyle: ctaStyle.trim() || undefined,
        platformNotes: platformNotes.trim() || undefined,
        forbiddenTopics: forbiddenTopics.trim() || undefined,
        referenceLinks: referenceLinks.trim() || undefined,
        hasSocialPresence,
        inspirationBrands: inspirationBrands.trim() || undefined,
        brandMission: brandMission.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni az AI-profilt");
      setSaving(false);
    }
  }

  return (
    <div className="chat-modal-backdrop">
      <form className="chat-modal lead-form" onSubmit={handleSubmit}>
        <h2>AI-profil — {clientName}</h2>

        {loading ? (
          <p className="chat-empty-hint">Betöltés...</p>
        ) : (
          <>
            <label htmlFor="ai-brand-voice">Hangvétel</label>
            <textarea
              id="ai-brand-voice"
              rows={2}
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.currentTarget.value)}
              placeholder="Pl. közvetlen, tegező, humoros"
            />

            <label htmlFor="ai-target-audience">Célközönség</label>
            <textarea
              id="ai-target-audience"
              rows={2}
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.currentTarget.value)}
            />

            <label htmlFor="ai-visual-direction">Vizuális irány</label>
            <textarea
              id="ai-visual-direction"
              rows={2}
              value={visualDirection}
              onChange={(e) => setVisualDirection(e.currentTarget.value)}
              placeholder="Színek, betűtípus, stílusreferenciák"
            />

            <label htmlFor="ai-cta-style">CTA-stílus</label>
            <textarea id="ai-cta-style" rows={2} value={ctaStyle} onChange={(e) => setCtaStyle(e.currentTarget.value)} />

            <label htmlFor="ai-platform-notes">Platform-specifikus jegyzetek</label>
            <textarea
              id="ai-platform-notes"
              rows={3}
              value={platformNotes}
              onChange={(e) => setPlatformNotes(e.currentTarget.value)}
              placeholder="Pl. TikTok: energikusabb hook; Instagram: rövidebb caption"
            />

            <label htmlFor="ai-forbidden-topics">Kerülendő témák/szavak</label>
            <textarea
              id="ai-forbidden-topics"
              rows={3}
              value={forbiddenTopics}
              onChange={(e) => setForbiddenTopics(e.currentTarget.value)}
              placeholder="Soronként egy"
            />

            <label className="ai-profile-checkbox">
              <input
                type="checkbox"
                checked={!hasSocialPresence}
                onChange={(e) => setHasSocialPresence(!e.currentTarget.checked)}
              />
              Az ügyfélnek nincs meglévő social media jelenléte
            </label>

            {hasSocialPresence ? (
              <>
                <label htmlFor="ai-reference-links">Korábbi jól teljesítő tartalmak (linkek)</label>
                <textarea
                  id="ai-reference-links"
                  rows={3}
                  value={referenceLinks}
                  onChange={(e) => setReferenceLinks(e.currentTarget.value)}
                  placeholder="Soronként egy link"
                />
              </>
            ) : (
              <>
                <label htmlFor="ai-inspiration-brands">Inspirációs márkák/versenytársak</label>
                <textarea
                  id="ai-inspiration-brands"
                  rows={2}
                  value={inspirationBrands}
                  onChange={(e) => setInspirationBrands(e.currentTarget.value)}
                  placeholder="Olyan márkák, amiknek a social media stílusát megközelítenénk"
                />

                <label htmlFor="ai-brand-mission">Márka küldetése / fő üzenete</label>
                <textarea
                  id="ai-brand-mission"
                  rows={2}
                  value={brandMission}
                  onChange={(e) => setBrandMission(e.currentTarget.value)}
                />
              </>
            )}
          </>
        )}

        {error && <p className="login-error">{error}</p>}

        <div className="chat-modal-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            Mégse
          </button>
          <button type="submit" disabled={saving || loading}>
            {saving ? "Mentés..." : "Mentés"}
          </button>
        </div>
      </form>
    </div>
  );
}
