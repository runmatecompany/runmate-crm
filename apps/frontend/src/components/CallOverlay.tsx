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

// A setSinkId (kimeneti eszköz váltása) még nincs benne minden DOM-tipizálásban,
// pedig a Chromium-alapú motorok (és így a Tauri WebView2 is) már támogatják.
type SinkCapableAudio = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };

function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const { outputDeviceId } = useCall();
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);

  useEffect(() => {
    const el = ref.current as SinkCapableAudio | null;
    if (el?.setSinkId && outputDeviceId) {
      el.setSinkId(outputDeviceId).catch(() => {
        // az eszköz időközben eltűnhetett, marad az alapértelmezett kimenet
      });
    }
  }, [outputDeviceId]);

  return <audio ref={ref} autoPlay />;
}

function CallDeviceSettings() {
  const { inputDeviceId, outputDeviceId, setInputDevice, setOutputDevice } = useCall();
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    function refresh() {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        setInputs(devices.filter((d) => d.kind === "audioinput"));
        setOutputs(devices.filter((d) => d.kind === "audiooutput"));
      });
    }
    refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, []);

  return (
    <div className="call-device-settings">
      <label className="call-device-row">
        <span>Mikrofon</span>
        <select
          value={inputDeviceId ?? ""}
          onChange={(e) => setInputDevice(e.currentTarget.value || null)}
        >
          <option value="">Alapértelmezett</option>
          {inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || "Mikrofon"}
            </option>
          ))}
        </select>
      </label>
      <label className="call-device-row">
        <span>Hangszóró</span>
        <select
          value={outputDeviceId ?? ""}
          onChange={(e) => setOutputDevice(e.currentTarget.value || null)}
        >
          <option value="">Alapértelmezett</option>
          {outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || "Hangszóró"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
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
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (status !== "connected") {
      setElapsed(0);
      setShowSettings(false);
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

          {showSettings && <CallDeviceSettings />}

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
            <button
              type="button"
              className={showSettings ? "call-bar-btn call-bar-icon active" : "call-bar-btn call-bar-icon"}
              title="Hang beállítások"
              onClick={() => setShowSettings((v) => !v)}
            >
              ⚙
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
