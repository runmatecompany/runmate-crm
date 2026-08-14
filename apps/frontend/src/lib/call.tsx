import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { useRealtime } from "./realtime";

export type CallStatus = "idle" | "calling" | "ringing" | "connected";

interface CallPeerInfo {
  roomId: number;
  userId: number;
  name: string;
}

interface CallValue {
  status: CallStatus;
  peer: CallPeerInfo | null;
  muted: boolean;
  remoteStream: MediaStream | null;
  startCall: (roomId: number, targetUserId: number, targetName: string) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
}

const CallContext = createContext<CallValue | undefined>(undefined);

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

interface PendingOffer {
  sdp: RTCSessionDescriptionInit;
  roomId: number;
  fromUserId: number;
  fromName: string;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const { sendFrame, onFrame } = useRealtime();

  const [status, setStatus] = useState<CallStatus>("idle");
  const [peer, setPeer] = useState<CallPeerInfo | null>(null);
  const [muted, setMuted] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingOfferRef = useRef<PendingOffer | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const statusRef = useRef<CallStatus>("idle");
  statusRef.current = status;

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
    setMuted(false);
  }, []);

  function createPeerConnection(targetUserId: number, roomId: number) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendFrame({
          type: "call-ice-candidate",
          roomId,
          targetUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };
    pc.ontrack = (event) => {
      setRemoteStream(event.streams[0]);
    };
    pcRef.current = pc;
    return pc;
  }

  const startCall = useCallback(
    async (roomId: number, targetUserId: number, targetName: string) => {
      if (statusRef.current !== "idle") return;
      setPeer({ roomId, userId: targetUserId, name: targetName });
      setStatus("calling");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStreamRef.current = stream;
        const pc = createPeerConnection(targetUserId, roomId);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendFrame({
          type: "call-offer",
          roomId,
          targetUserId,
          sdp: offer,
          fromName: auth?.user.name ?? "Valaki",
        });
      } catch {
        cleanup();
        setStatus("idle");
        setPeer(null);
      }
    },
    [sendFrame, auth, cleanup]
  );

  const acceptCall = useCallback(async () => {
    const pending = pendingOfferRef.current;
    if (!pending) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const pc = createPeerConnection(pending.fromUserId, pending.roomId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(pending.sdp));
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(candidate);
      }
      pendingCandidatesRef.current = [];
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendFrame({ type: "call-answer", roomId: pending.roomId, targetUserId: pending.fromUserId, sdp: answer });
      setStatus("connected");
    } catch {
      cleanup();
      setStatus("idle");
      setPeer(null);
    }
  }, [sendFrame, cleanup]);

  const rejectCall = useCallback(() => {
    const pending = pendingOfferRef.current;
    if (pending) {
      sendFrame({ type: "call-reject", roomId: pending.roomId, targetUserId: pending.fromUserId });
    }
    cleanup();
    setStatus("idle");
    setPeer(null);
  }, [sendFrame, cleanup]);

  const endCall = useCallback(() => {
    if (peer) {
      sendFrame({ type: "call-end", roomId: peer.roomId, targetUserId: peer.userId });
    }
    cleanup();
    setStatus("idle");
    setPeer(null);
  }, [peer, sendFrame, cleanup]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, [muted]);

  useEffect(() => {
    const unsubs = [
      onFrame("call-offer", (frame) => {
        if (statusRef.current !== "idle") {
          sendFrame({ type: "call-reject", roomId: frame.roomId, targetUserId: frame.fromUserId });
          return;
        }
        pendingOfferRef.current = {
          sdp: frame.sdp,
          roomId: frame.roomId,
          fromUserId: frame.fromUserId,
          fromName: frame.fromName ?? "Valaki",
        };
        setPeer({ roomId: frame.roomId, userId: frame.fromUserId, name: frame.fromName ?? "Valaki" });
        setStatus("ringing");
      }),
      onFrame("call-answer", async (frame) => {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(frame.sdp));
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(candidate);
        }
        pendingCandidatesRef.current = [];
        setStatus("connected");
      }),
      onFrame("call-ice-candidate", async (frame) => {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          pendingCandidatesRef.current.push(frame.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(frame.candidate);
        } catch {
          // hibás jelölt, kihagyjuk
        }
      }),
      onFrame("call-end", () => {
        cleanup();
        setStatus("idle");
        setPeer(null);
      }),
      onFrame("call-reject", () => {
        cleanup();
        setStatus("idle");
        setPeer(null);
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, [onFrame, sendFrame, cleanup]);

  return (
    <CallContext.Provider
      value={{ status, peer, muted, remoteStream, startCall, acceptCall, rejectCall, endCall, toggleMute }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall(): CallValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error("useCall must be used within a CallProvider");
  }
  return ctx;
}
