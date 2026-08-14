import { useEffect, useRef, useState } from "react";
import { useCall } from "../lib/call";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

export default function CallOverlay() {
  const { status, peer, muted, remoteStream, acceptCall, rejectCall, endCall, toggleMute } = useCall();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (status !== "connected") {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === "idle" || !peer) return null;

  return (
    <div className="call-overlay">
      <audio ref={audioRef} autoPlay />

      {status === "ringing" && (
        <div className="call-card">
          <div className="call-peer-name">{peer.name} hív téged</div>
          <div className="call-actions">
            <button type="button" className="call-btn call-accept" onClick={acceptCall}>
              Elfogad
            </button>
            <button type="button" className="call-btn call-reject" onClick={rejectCall}>
              Elutasít
            </button>
          </div>
        </div>
      )}

      {status === "calling" && (
        <div className="call-card">
          <div className="call-peer-name">Hívás... {peer.name}</div>
          <div className="call-actions">
            <button type="button" className="call-btn call-reject" onClick={endCall}>
              Megszakítás
            </button>
          </div>
        </div>
      )}

      {status === "connected" && (
        <div className="call-bar">
          <span className="call-bar-info">
            Hívás — {peer.name} · {formatDuration(elapsed)}
          </span>
          <button type="button" className="call-bar-btn" onClick={toggleMute}>
            {muted ? "Némítás fel" : "Némítás"}
          </button>
          <button type="button" className="call-bar-btn call-bar-end" onClick={endCall}>
            Hívás vége
          </button>
        </div>
      )}
    </div>
  );
}
