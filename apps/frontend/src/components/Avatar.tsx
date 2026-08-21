import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";
import { useRealtime } from "../lib/realtime";
import { useColleagueDirectory } from "../lib/colleagueDirectory";
import { fetchAvatarBlobUrl } from "../lib/profile";
import { useEscapeToClose } from "../lib/useEscapeToClose";

interface AvatarProps {
  userId: number;
  name: string;
  size?: number;
}

const PALETTE = ["#2f7fe0", "#5b8c3e", "#b8622f", "#8955c4", "#c23f6f", "#2c9c8f"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function Avatar({ userId, name, size = 32 }: AvatarProps) {
  const { auth } = useAuth();
  const { avatarVersions, names, onlineUserIds } = useRealtime();
  const { getColleague } = useColleagueDirectory();
  const version = avatarVersions[userId] ?? 0;
  const displayName = names[userId] ?? name;
  const online = onlineUserIds.has(userId);
  const [url, setUrl] = useState<string | null>(null);
  const [showCard, setShowCard] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!auth?.token) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    fetchAvatarBlobUrl(auth.token, userId, version).then((blobUrl) => {
      if (cancelled) {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        return;
      }
      objectUrl = blobUrl;
      setUrl(blobUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [auth?.token, userId, version]);

  // Kívülre kattintásra is záródjon a buborék, nem csak Esc-re vagy újbóli
  // avatár-kattintásra.
  useEffect(() => {
    if (!showCard) return;
    function handlePointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowCard(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showCard]);

  useEscapeToClose(() => setShowCard(false));

  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const dotSize = Math.max(8, Math.round(size * 0.3));
  const colleague = getColleague(userId);

  return (
    <span className="avatar-wrap" style={{ width: size, height: size }} ref={wrapRef}>
      <button
        type="button"
        className="avatar-trigger"
        style={{ width: size, height: size }}
        onClick={(e) => {
          e.stopPropagation();
          setShowCard((prev) => !prev);
        }}
        aria-label={`${displayName} elérhetősége`}
      >
        {url ? (
          <img src={url} alt={displayName} className="avatar-img" style={{ width: size, height: size }} />
        ) : (
          <div
            className="avatar-fallback"
            style={{ width: size, height: size, fontSize: size * 0.42, backgroundColor: colorForName(displayName) }}
          >
            {initial}
          </div>
        )}
      </button>
      <span
        className={online ? "avatar-status online" : "avatar-status offline"}
        style={{ width: dotSize, height: dotSize }}
        title={online ? "Elérhető" : "Nem elérhető"}
      />

      {showCard && (
        <div className="avatar-card" onClick={(e) => e.stopPropagation()}>
          <div className="avatar-card-name">{colleague?.name ?? displayName}</div>
          <div className="avatar-card-phone">
            {colleague?.phone ? colleague.phone : "Nincs megadva telefonszám"}
          </div>
        </div>
      )}
    </span>
  );
}
