import { useEffect, useRef, useState } from "react";
import { useCall, type RemoteParticipant } from "../lib/call";
import Avatar from "./Avatar";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

function ScreenVideo({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="call-screen-tile">
      <video ref={ref} autoPlay playsInline className="call-screen-video" />
      <span className="call-screen-tile-label">{label}</span>
    </div>
  );
}

export default function CallOverlay() {
  const {
    status,
    peer,
    participants,
    muted,
    sharingScreen,
    localScreenStream,
    acceptCall,
    rejectCall,
    leaveCall,
    toggleMute,
    toggleScreenShare,
  } = useCall();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== "connected") {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  if (status === "idle") return null;

  const screenShares: { userId: number; name: string; stream: MediaStream }[] = [
    ...(localScreenStream ? [{ userId: -1, name: "Te", stream: localScreenStream }] : []),
    ...participants
      .filter((p): p is RemoteParticipant & { screenStream: MediaStream } => p.screenStream != null)
      .map((p) => ({ userId: p.userId, name: p.name, stream: p.screenStream })),
  ];

  return (
    <div className="call-overlay">
      {participants.map((p) => (
        <RemoteAudio key={p.userId} stream={p.micStream} />
      ))}

      {status === "ringing" && peer && (
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

      {status === "calling" && peer && (
        <div className="call-card">
          <div className="call-peer-name">Hívás... {peer.name}</div>
          <div className="call-actions">
            <button type="button" className="call-btn call-reject" onClick={leaveCall}>
              Megszakítás
            </button>
          </div>
        </div>
      )}

      {status === "connected" && (
        <div className="call-panel">
          {screenShares.length > 0 && (
            <div className="call-screen-grid">
              {screenShares.map((s) => (
                <ScreenVideo key={s.userId} stream={s.stream} label={s.name} />
              ))}
            </div>
          )}

          <div className="call-bar">
            <div className="call-participants">
              {participants.map((p) => (
                <div key={p.userId} className="call-participant" title={p.name}>
                  <Avatar userId={p.userId} name={p.name} size={26} />
                  {p.sharingScreen && <span className="call-participant-sharing" title="Képernyőt oszt meg" />}
                </div>
              ))}
            </div>
            <span className="call-bar-info">{formatDuration(elapsed)}</span>
            <button type="button" className="call-bar-btn" onClick={toggleMute}>
              {muted ? "Némítás fel" : "Némítás"}
            </button>
            <button
              type="button"
              className={sharingScreen ? "call-bar-btn call-share-btn active" : "call-bar-btn call-share-btn"}
              onClick={toggleScreenShare}
            >
              {sharingScreen ? "Megosztás leállítása" : "Képernyőmegosztás"}
            </button>
            <button type="button" className="call-bar-btn call-bar-end" onClick={leaveCall}>
              Kilépés
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
