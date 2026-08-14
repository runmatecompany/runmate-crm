import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useRealtime } from "../lib/realtime";
import { fetchAvatarBlobUrl } from "../lib/profile";

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
  const version = avatarVersions[userId] ?? 0;
  const displayName = names[userId] ?? name;
  const online = onlineUserIds.has(userId);
  const [url, setUrl] = useState<string | null>(null);

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

  const initial = displayName.trim().charAt(0).toUpperCase() || "?";
  const dotSize = Math.max(8, Math.round(size * 0.3));

  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
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
      <span
        className={online ? "avatar-status online" : "avatar-status offline"}
        style={{ width: dotSize, height: dotSize }}
        title={online ? "Elérhető" : "Nem elérhető"}
      />
    </span>
  );
}
