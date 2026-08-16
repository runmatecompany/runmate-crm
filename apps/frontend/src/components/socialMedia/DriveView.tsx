import { useEffect, useState } from "react";
import { useAuth } from "../../lib/auth";
import { getDriveRootLink } from "../../lib/socialMedia";

// Egy gomb, ami megnyitja a böngészőben a teljes "Runmate CRM" Drive-mappát
// (benne minden ügyfélmappával és a bennük lévő forgatás/vágás anyagokkal)
// — nincs beépített fájlböngésző, csak gyors kiugrás a valódi Drive-ra.
export default function DriveView() {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    getDriveRootLink(token)
      .then(setLink)
      .catch((err) => setError(err instanceof Error ? err.message : "Nem sikerült lekérni a Drive-mappát"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <p className="chat-empty-hint">Betöltés...</p>;
  if (error) return <p className="login-error">{error}</p>;

  return (
    <div className="sm-drive-view">
      <p>
        Itt éred el a "Runmate CRM" Google Drive-mappát, benne az összes ügyfélmappával és a bennük lévő forgatás/vágás
        anyagokkal.
      </p>
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="sm-drive-open-link">
          Runmate CRM mappa megnyitása
        </a>
      )}
    </div>
  );
}
