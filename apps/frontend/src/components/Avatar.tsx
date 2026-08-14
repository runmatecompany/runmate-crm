import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { fetchAvatarBlobUrl } from "../lib/profile";

interface AvatarProps {
  userId: number;
  name: string;
  size?: number;
  version?: number;
}

const PALETTE = ["#2f7fe0", "#5b8c3e", "#b8622f", "#8955c4", "#c23f6f", "#2c9c8f"];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export default function Avatar({ userId, name, size = 32, version = 0 }: AvatarProps) {
  const { auth } = useAuth();
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

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="avatar-img"
        style={{ width: size, height: size }}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className="avatar-fallback"
      style={{ width: size, height: size, fontSize: size * 0.42, backgroundColor: colorForName(name) }}
    >
      {initial}
    </div>
  );
}
