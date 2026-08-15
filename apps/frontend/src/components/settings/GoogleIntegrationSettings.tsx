import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAuth } from "../../lib/auth";
import {
  disconnectGoogleCalendar,
  getGoogleCalendarAuthUrl,
  getGoogleCalendarStatus,
  type GoogleCalendarStatus,
} from "../../lib/googleCalendar";

export default function GoogleIntegrationSettings() {
  const { auth } = useAuth();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    if (!auth) return;
    getGoogleCalendarStatus(auth.token).then(setStatus);
  }

  useEffect(refresh, [auth]);

  async function handleConnect() {
    if (!auth) return;
    setConnecting(true);
    setError(null);
    try {
      const url = await getGoogleCalendarAuthUrl(auth.token);
      await openUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nem sikerült elindítani a kapcsolódást");
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!auth) return;
    if (!confirm("Biztosan bontod a Google-kapcsolatot?")) return;
    await disconnectGoogleCalendar(auth.token);
    refresh();
  }

  return (
    <div className="social-media-settings">
      <h2>Google-integráció</h2>
      <p className="chat-modal-hint">
        A rendszer 5 percenként figyeli a bekötött Google Naptárat: ha egy eseményen az ügyfél email-címe
        meghívottként szerepel, vagy az ügyfél neve az esemény címében/leírásában van, azt a rendszer a
        következő forgatás dátumaként rögzíti, automatikusan létrehoz hozzá egy tartalmat, és az ügyfél
        automatikus naptár-meghívót kap emailben. Ugyanez a kapcsolat teszi lehetővé a nyersanyag-fájlok
        feltöltését is az ügyfél Google Drive-mappájába.
      </p>

      {!status && <p className="chat-empty-hint">Betöltés...</p>}

      {status && status.connected && (
        <>
          <p>
            Kapcsolódva: <strong>{status.connectedEmail}</strong>
          </p>
          <p className="chat-empty-hint">
            {status.lastSyncedAt
              ? `Legutóbbi szinkron: ${new Date(status.lastSyncedAt).toLocaleString("hu-HU")}`
              : "Még nem történt szinkron."}
          </p>
          <p className="chat-modal-hint">
            Ha ez a kapcsolat még a Drive-feltöltés bevezetése előtt jött létre, a fájlfeltöltés nem fog
            működni, amíg újra nem kötöd (a "Kapcsolódás" gomb újra felkínálja az összes szükséges jogot).
          </p>
          <button type="button" onClick={handleConnect} disabled={connecting}>
            {connecting ? "Megnyitás..." : "Kapcsolódás újra (jogok frissítése)"}
          </button>
          <button type="button" onClick={handleDisconnect}>
            Kapcsolat bontása
          </button>
        </>
      )}

      {status && !status.connected && (
        <button type="button" onClick={handleConnect} disabled={connecting}>
          {connecting ? "Megnyitás..." : "Kapcsolódás Google-fiókkal"}
        </button>
      )}

      {error && <p className="login-error">{error}</p>}
    </div>
  );
}
