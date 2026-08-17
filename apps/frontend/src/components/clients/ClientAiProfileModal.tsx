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
  const [contentGoals, setContentGoals] = useState("");
  const [publishingCadence, setPublishingCadence] = useState("");
  const [approvalProcessNotes, setApprovalProcessNotes] = useState("");
  const [monthlyVideoTarget, setMonthlyVideoTarget] = useState("");
  const [monthlyPostTarget, setMonthlyPostTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportText, setExportText] = useState<string | null>(null);

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
        setContentGoals(profile.content_goals ?? "");
        setPublishingCadence(profile.publishing_cadence ?? "");
        setApprovalProcessNotes(profile.approval_process_notes ?? "");
        setMonthlyVideoTarget(profile.monthly_video_target != null ? String(profile.monthly_video_target) : "");
        setMonthlyPostTarget(profile.monthly_post_target != null ? String(profile.monthly_post_target) : "");
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
        contentGoals: contentGoals.trim() || undefined,
        publishingCadence: publishingCadence.trim() || undefined,
        approvalProcessNotes: approvalProcessNotes.trim() || undefined,
        monthlyVideoTarget: monthlyVideoTarget.trim() ? Number(monthlyVideoTarget) : undefined,
        monthlyPostTarget: monthlyPostTarget.trim() ? Number(monthlyPostTarget) : undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült menteni az AI-profilt");
      setSaving(false);
    }
  }

  // Kimásolható szöveg egy külső AI-chatbe (pl. a felhasználó saját Claude/
  // ChatGPT előfizetése) beillesztéshez — így nem kell API-kulcsot fizetni
  // ahhoz, hogy valaki AI-segítséget kérjen a profil alapján. Az üres
  // mezőket kihagyjuk, hogy tiszta maradjon a beillesztett szöveg.
  function buildExportText(): string {
    const lines = [`ÜGYFÉL: ${clientName}`, ""];
    const field = (label: string, value: string) => {
      if (value.trim()) lines.push(`${label}: ${value.trim()}`, "");
    };
    field("Hangvétel", brandVoice);
    field("Célközönség", targetAudience);
    field("Tartalmi cél és típusok", contentGoals);
    field("Publikálási ritmus", publishingCadence);
    field("Havi videó-cél", monthlyVideoTarget);
    field("Havi képes poszt-cél", monthlyPostTarget);
    field("Vizuális irány", visualDirection);
    field("CTA-stílus", ctaStyle);
    field("Platform-specifikus jegyzetek", platformNotes);
    field("Jóváhagyási folyamat", approvalProcessNotes);
    field("Kerülendő témák/szavak", forbiddenTopics);
    lines.push(`Social media jelenlét: ${hasSocialPresence ? "van" : "nincs"}`, "");
    if (hasSocialPresence) {
      field("Korábbi jól teljesítő tartalmak", referenceLinks);
    } else {
      field("Inspirációs márkák/versenytársak", inspirationBrands);
      field("Márka küldetése/fő üzenete", brandMission);
    }
    return lines.join("\n").trim();
  }

  function handleExport() {
    const text = buildExportText();
    setExportText(text);
    navigator.clipboard?.writeText(text).catch(() => {});
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

            <label htmlFor="ai-content-goals">Tartalmi cél és típusok</label>
            <textarea
              id="ai-content-goals"
              rows={2}
              value={contentGoals}
              onChange={(e) => setContentGoals(e.currentTarget.value)}
              placeholder="Pl. havi 4 videó Instagramra és TikTokra, 8 poszt"
            />

            <label htmlFor="ai-publishing-cadence">Publikálási ritmus</label>
            <textarea
              id="ai-publishing-cadence"
              rows={2}
              value={publishingCadence}
              onChange={(e) => setPublishingCadence(e.currentTarget.value)}
              placeholder="Pl. hetente 2 poszt, mindig kedden és pénteken"
            />

            <label htmlFor="ai-monthly-video-target">Havi videó-cél</label>
            <input
              id="ai-monthly-video-target"
              type="number"
              min={0}
              value={monthlyVideoTarget}
              onChange={(e) => setMonthlyVideoTarget(e.currentTarget.value)}
              placeholder="Pl. 8"
            />

            <label htmlFor="ai-monthly-post-target">Havi képes poszt-cél</label>
            <input
              id="ai-monthly-post-target"
              type="number"
              min={0}
              value={monthlyPostTarget}
              onChange={(e) => setMonthlyPostTarget(e.currentTarget.value)}
              placeholder="Pl. 8"
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

            <label htmlFor="ai-approval-process">Jóváhagyási folyamat</label>
            <textarea
              id="ai-approval-process"
              rows={2}
              value={approvalProcessNotes}
              onChange={(e) => setApprovalProcessNotes(e.currentTarget.value)}
              placeholder="Pl. az ügyfél 48 órán belül visszajelez emailben"
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

        {!loading && (
          <>
            <div className="sm-detail-action">
              <button type="button" onClick={handleExport}>
                Profil exportálása (vágólapra + külső AI-hoz)
              </button>
            </div>
            {exportText && (
              <>
                <p className="chat-empty-hint">
                  Vágólapra másolva (ha engedélyezve van a böngésző) — vagy jelöld ki innen kézzel, és illeszd be egy
                  külső AI-chatbe (pl. Claude, ChatGPT).
                </p>
                <textarea readOnly rows={8} value={exportText} onClick={(e) => e.currentTarget.select()} />
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
