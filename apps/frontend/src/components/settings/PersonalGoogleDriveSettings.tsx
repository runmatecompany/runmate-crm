import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAuth } from "../../lib/auth";
import {
  disconnectPersonalGoogleDrive,
  getPersonalGoogleDriveAuthUrl,
  getPersonalGoogleDriveStatus,
  type PersonalGoogleDriveStatus,
} from "../../lib/googleDrivePersonal";

// Ez a saját, személyes Google-fiók összekötése — nem ugyanaz, mint a
// Beállítások > Google-integráció (az egy admin-szintű, közös RunMate
// fiók). Ha ez össze van kötve, a Content Kanban klip-feltöltése
// egyenesen a saját Google-fiókról megy a Drive-ra, a RunMate szerver
// megkerülésével — jelentősen gyorsabb, mint a szerveren átmenő feltöltés.
export default function PersonalGoogleDriveSettings() {
  const { auth } = useAuth();
  const [status, setStatus] = useState<PersonalGoogleDriveStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);
  const wasConnected = useRef<boolean | null>(null);

  function refresh() {
    if (!auth) return;
    getPersonalGoogleDriveStatus(auth.token).then((next) => {
      // A kapcsolódás egy külső böngészőablakban zajlik (OAuth consent) —
      // amikor a felhasználó visszavált az appba, ezt kell észlelnie,
      // hogy tudja, sikerült-e. A false→true átmenetre külön, jól
      // látható sikeres visszajelzést mutatunk, nem csak a state csendes
      // frissülését.
      if (wasConnected.current === false && next.connected) {
        setJustConnected(true);
        setTimeout(() => setJustConnected(false), 6000);
      }
      wasConnected.current = next.connected;
      setStatus(next);
    });
  }

  useEffect(refresh, [auth]);

  // Amíg a felhasználó a rendszer böngészőjében intézi az OAuth
  // engedélyezést, az app ablaka a háttérben marad — visszaváltáskor
  // (focus) frissítjük az állapotot, hogy ne kelljen kézzel újranyitni a
  // Beállításokat a visszajelzés eléréséhez.
  useEffect(() => {
    function onFocus() {
      refresh();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth]);

  async function handleConnect() {
    if (!auth) return;
    setConnecting(true);
    setError(null);
    setJustConnected(false);
    try {
      const url = await getPersonalGoogleDriveAuthUrl(auth.token);
      await openUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elindítani a kapcsolódást");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!auth) return;
    if (!confirm("Biztosan bontod a saját Google-fiókod kapcsolatát?")) return;
    await disconnectPersonalGoogleDrive(auth.token);
    wasConnected.current = false;
    setJustConnected(false);
    refresh();
  }

  return (
    <div className="social-media-settings profile-google-drive">
      <h2>Saját Google Drive</h2>
      <p className="chat-modal-hint">
        Ha itt összeköted a saját Google-fiókodat, a Content Kanbanban a klipek feltöltése egyenesen a te
        fiókodból megy a Drive-ra — gyorsabb, mintha a RunMate szerverén keresztül menne.
      </p>

      {!status && <p className="chat-empty-hint">Betöltés...</p>}

      {justConnected && (
        <p className="profile-google-drive-success">✓ Sikeresen összekötve — mostantól ezt a fiókot használja a gyors feltöltés.</p>
      )}

      {status && status.connected && (
        <>
          <p>
            Összekötve: <strong>{status.connectedEmail}</strong>
          </p>
          <button type="button" onClick={handleDisconnect}>
            Kapcsolat bontása
          </button>
        </>
      )}

      {status && !status.connected && (
        <button type="button" onClick={handleConnect} disabled={connecting}>
          {connecting ? "Megnyitás..." : "Saját Google-fiók összekötése"}
        </button>
      )}

      {error && <p className="login-error">{error}</p>}
    </div>
  );
}
