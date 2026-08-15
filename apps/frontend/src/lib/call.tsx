import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import { useRealtime } from "./realtime";
import { fetchActiveCalls, listColleagues, type CallParticipant } from "./chat";

export type CallStatus = "idle" | "calling" | "ringing" | "connected";

interface CallPeerInfo {
  roomId: number;
  userId: number;
  name: string;
}

export interface RemoteParticipant {
  userId: number;
  name: string;
  micStream: MediaStream | null;
  screenStream: MediaStream | null;
  sharingScreen: boolean;
}

export interface DisplayParticipant {
  userId: number;
  name: string;
  sharingScreen: boolean;
}

interface CallValue {
  status: CallStatus;
  roomId: number | null;
  peer: CallPeerInfo | null;
  participants: RemoteParticipant[];
  muted: boolean;
  sharingScreen: boolean;
  localScreenStream: MediaStream | null;
  roomRosters: Map<number, DisplayParticipant[]>;
  joinCall: (roomId: number, isDm: boolean, otherUserId?: number, otherName?: string) => void;
  leaveCall: () => void;
  acceptCall: () => void;
  rejectCall: () => void;
  toggleMute: () => void;
  toggleScreenShare: () => void;
}

const CallContext = createContext<CallValue | undefined>(undefined);

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export function CallProvider({ children }: { children: ReactNode }) {
  const { auth } = useAuth();
  const token = auth?.token ?? null;
  const { sendFrame, onFrame, names } = useRealtime();

  const [status, setStatus] = useState<CallStatus>("idle");
  const [roomId, setRoomId] = useState<number | null>(null);
  const [peer, setPeer] = useState<CallPeerInfo | null>(null);
  const [participants, setParticipants] = useState<Map<number, RemoteParticipant>>(new Map());
  const [muted, setMuted] = useState(false);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [roomRosters, setRoomRosters] = useState<Map<number, DisplayParticipant[]>>(new Map());
  const [colleagueNames, setColleagueNames] = useState<Record<number, string>>({});

  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const politeRef = useRef<Map<number, boolean>>(new Map());
  const makingOfferRef = useRef<Map<number, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<number, boolean>>(new Map());
  const pendingCandidatesRef = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const localMicStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const currentRoomIdRef = useRef<number | null>(null);
  const statusRef = useRef<CallStatus>("idle");
  statusRef.current = status;

  // Egy résztvevő nevének feloldásához — a Realtime kontextus élő
  // frissítéseit (profile-updated) és a kollégalistát is figyelembe véve,
  // hogy ne csak az aktuális DM-partnerre legyen nevünk.
  const resolveName = useCallback(
    (userId: number) => names[userId] ?? colleagueNames[userId] ?? "Ismeretlen",
    [names, colleagueNames]
  );

  useEffect(() => {
    if (!token) return;
    listColleagues(token).then((list) => {
      setColleagueNames(Object.fromEntries(list.map((c) => [c.id, c.name])));
    });
  }, [token]);

  function resetCallState() {
    for (const pc of peersRef.current.values()) pc.close();
    peersRef.current.clear();
    politeRef.current.clear();
    makingOfferRef.current.clear();
    ignoreOfferRef.current.clear();
    pendingCandidatesRef.current.clear();
    localMicStreamRef.current?.getTracks().forEach((track) => track.stop());
    localScreenStreamRef.current?.getTracks().forEach((track) => track.stop());
    localMicStreamRef.current = null;
    localScreenStreamRef.current = null;
    currentRoomIdRef.current = null;
    setRoomId(null);
    setPeer(null);
    setParticipants(new Map());
    setMuted(false);
    setSharingScreen(false);
    setLocalScreenStream(null);
    setStatus("idle");
  }

  function removePeer(remoteUserId: number) {
    const pc = peersRef.current.get(remoteUserId);
    if (pc) pc.close();
    peersRef.current.delete(remoteUserId);
    politeRef.current.delete(remoteUserId);
    makingOfferRef.current.delete(remoteUserId);
    ignoreOfferRef.current.delete(remoteUserId);
    pendingCandidatesRef.current.delete(remoteUserId);
    setParticipants((prev) => {
      const next = new Map(prev);
      next.delete(remoteUserId);
      return next;
    });
  }

  // Minden pár-kapcsolathoz külön RTCPeerConnection — a "polite" szerep egyszer
  // dől el (aki csatlakozik, mindig ő ajánl elsőként = impolite), és onnantól
  // ez vezérli, hogyan oldódik fel egy esetleges egyidejű ajánlat-ütközés
  // (pl. amikor mindkét fél nagyjából egyszerre indít képernyőmegosztást).
  function getOrCreatePeer(remoteUserId: number, polite: boolean): RTCPeerConnection {
    const existing = peersRef.current.get(remoteUserId);
    if (existing) return existing;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    politeRef.current.set(remoteUserId, polite);
    makingOfferRef.current.set(remoteUserId, false);
    ignoreOfferRef.current.set(remoteUserId, false);

    const mic = localMicStreamRef.current;
    if (mic) mic.getTracks().forEach((track) => pc.addTrack(track, mic));
    const screen = localScreenStreamRef.current;
    if (screen) screen.getTracks().forEach((track) => pc.addTrack(track, screen));

    pc.onnegotiationneeded = async () => {
      try {
        makingOfferRef.current.set(remoteUserId, true);
        await pc.setLocalDescription();
        sendFrame({
          type: "call-offer",
          roomId: currentRoomIdRef.current,
          targetUserId: remoteUserId,
          sdp: pc.localDescription,
        });
      } catch {
        // A következő állapotváltozás úgyis újra kiváltja a renegociációt.
      } finally {
        makingOfferRef.current.set(remoteUserId, false);
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendFrame({
          type: "call-ice-candidate",
          roomId: currentRoomIdRef.current,
          targetUserId: remoteUserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Nincs kamera-videó ebben az appban, és a képernyőmegosztás szándékosan
    // csak videótrack-et küld (nincs rendszerhang-megosztás) — így a
    // track.kind egyértelműen eldönti, hogy mikrofon vagy képernyő adatáról
    // van szó, nem kell stream-azonosító alapján találgatni.
    pc.ontrack = (event) => {
      const kind = event.track.kind;
      setParticipants((prev) => {
        const next = new Map(prev);
        const current = next.get(remoteUserId) ?? {
          userId: remoteUserId,
          name: resolveName(remoteUserId),
          micStream: null,
          screenStream: null,
          sharingScreen: false,
        };
        if (kind === "audio") current.micStream = event.streams[0] ?? null;
        if (kind === "video") current.screenStream = event.streams[0] ?? null;
        next.set(remoteUserId, current);
        return next;
      });
      event.track.onended = () => {
        if (kind !== "video") return;
        setParticipants((prev) => {
          const next = new Map(prev);
          const current = next.get(remoteUserId);
          if (current) next.set(remoteUserId, { ...current, screenStream: null });
          return next;
        });
      };
    };

    peersRef.current.set(remoteUserId, pc);
    setParticipants((prev) => {
      if (prev.has(remoteUserId)) return prev;
      const next = new Map(prev);
      next.set(remoteUserId, {
        userId: remoteUserId,
        name: resolveName(remoteUserId),
        micStream: null,
        screenStream: null,
        sharingScreen: false,
      });
      return next;
    });
    return pc;
  }

  async function flushPendingCandidates(remoteUserId: number, pc: RTCPeerConnection) {
    const list = pendingCandidatesRef.current.get(remoteUserId);
    if (!list?.length) return;
    pendingCandidatesRef.current.set(remoteUserId, []);
    for (const candidate of list) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // hibás jelölt, kihagyjuk
      }
    }
  }

  const pendingDmInviteRef = useRef<{ otherUserId: number; otherName: string } | null>(null);

  const joinCall = useCallback(
    async (targetRoomId: number, isDm: boolean, otherUserId?: number, otherName?: string) => {
      if (statusRef.current !== "idle") return;
      currentRoomIdRef.current = targetRoomId;
      setRoomId(targetRoomId);
      pendingDmInviteRef.current =
        isDm && otherUserId != null ? { otherUserId, otherName: otherName ?? "Valaki" } : null;
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        localMicStreamRef.current = mic;
        sendFrame({ type: "call-join", roomId: targetRoomId });
        setStatus("connected"); // call-joined majd pontosítja (calling, ha DM és üres)
      } catch {
        resetCallState();
      }
    },
    [sendFrame]
  );

  const leaveCall = useCallback(() => {
    if (currentRoomIdRef.current != null) {
      sendFrame({ type: "call-leave", roomId: currentRoomIdRef.current });
    }
    resetCallState();
  }, [sendFrame]);

  const acceptCall = useCallback(() => {
    if (!peer) return;
    void joinCall(peer.roomId, true, peer.userId, peer.name);
  }, [peer, joinCall]);

  const rejectCall = useCallback(() => {
    if (peer) {
      sendFrame({ type: "call-decline", roomId: peer.roomId });
    }
    setPeer(null);
    setStatus("idle");
  }, [peer, sendFrame]);

  const toggleMute = useCallback(() => {
    const stream = localMicStreamRef.current;
    if (!stream) return;
    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, [muted]);

  const stopScreenShare = useCallback(() => {
    const stream = localScreenStreamRef.current;
    if (!stream) return;
    for (const pc of peersRef.current.values()) {
      for (const sender of pc.getSenders()) {
        if (sender.track && stream.getTracks().includes(sender.track)) {
          pc.removeTrack(sender);
        }
      }
    }
    stream.getTracks().forEach((track) => track.stop());
    localScreenStreamRef.current = null;
    setLocalScreenStream(null);
    setSharingScreen(false);
    if (currentRoomIdRef.current != null) {
      sendFrame({ type: "call-screen-share-state", roomId: currentRoomIdRef.current, sharing: false });
    }
  }, [sendFrame]);

  const toggleScreenShare = useCallback(async () => {
    if (localScreenStreamRef.current) {
      stopScreenShare();
      return;
    }
    try {
      // Szándékosan csak videó — a rendszerhang-megosztás kihagyva, hogy a
      // mikrofon- és képernyő-hang track.kind alapján egyértelműen
      // szétválasztható maradjon (lásd ontrack fent).
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      localScreenStreamRef.current = stream;
      setLocalScreenStream(stream);
      for (const pc of peersRef.current.values()) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      }
      stream.getVideoTracks()[0].onended = () => stopScreenShare();
      setSharingScreen(true);
      if (currentRoomIdRef.current != null) {
        sendFrame({ type: "call-screen-share-state", roomId: currentRoomIdRef.current, sharing: true });
      }
    } catch {
      // felhasználó megszakította a képernyőválasztót — nincs teendő
    }
  }, [sendFrame, stopScreenShare]);

  useEffect(() => {
    const unsubs = [
      onFrame("call-joined", (frame) => {
        if (frame.roomId !== currentRoomIdRef.current) return;
        const existing: CallParticipant[] = frame.participants ?? [];
        for (const p of existing) {
          getOrCreatePeer(p.userId, false); // mi csatlakozunk -> mi ajánlunk elsőként
        }
        const pendingInvite = pendingDmInviteRef.current;
        if (pendingInvite && existing.length === 0) {
          setPeer({ roomId: frame.roomId, userId: pendingInvite.otherUserId, name: pendingInvite.otherName });
          sendFrame({ type: "call-invite", roomId: frame.roomId, fromName: auth?.user.name ?? "Valaki" });
          setStatus("calling");
        } else {
          setStatus("connected");
        }
      }),

      onFrame("call-join-rejected", (frame) => {
        if (frame.roomId !== currentRoomIdRef.current) return;
        resetCallState();
      }),

      onFrame("call-roster-updated", (frame) => {
        const roomParticipants: CallParticipant[] = frame.participants ?? [];
        const display: DisplayParticipant[] = roomParticipants.map((p) => ({
          userId: p.userId,
          name: resolveName(p.userId),
          sharingScreen: p.sharingScreen,
        }));
        setRoomRosters((prev) => new Map(prev).set(frame.roomId, display));

        // Ha valaki még csörgést vár (nem csatlakozott), de a hívó fél
        // időközben kilépett, ne csörögjön tovább feleslegesen.
        if (
          statusRef.current === "ringing" &&
          peer != null &&
          peer.roomId === frame.roomId &&
          !roomParticipants.some((p) => p.userId === peer.userId)
        ) {
          setPeer(null);
          setStatus("idle");
        }

        if (frame.roomId !== currentRoomIdRef.current) return;

        const currentIds = new Set(roomParticipants.map((p) => p.userId));
        for (const existingUserId of Array.from(peersRef.current.keys())) {
          if (!currentIds.has(existingUserId)) removePeer(existingUserId);
        }
        setParticipants((prev) => {
          const next = new Map(prev);
          for (const p of roomParticipants) {
            const current = next.get(p.userId);
            if (current) next.set(p.userId, { ...current, sharingScreen: p.sharingScreen });
          }
          return next;
        });
        if (statusRef.current === "calling" && roomParticipants.length > 0) {
          setStatus("connected");
        }
      }),

      onFrame("call-invite", (frame) => {
        if (statusRef.current !== "idle") {
          sendFrame({ type: "call-decline", roomId: frame.roomId });
          return;
        }
        currentRoomIdRef.current = frame.roomId;
        setRoomId(frame.roomId);
        setPeer({ roomId: frame.roomId, userId: frame.fromUserId, name: frame.fromName ?? "Valaki" });
        setStatus("ringing");
      }),

      onFrame("call-declined", () => {
        if (statusRef.current === "calling") resetCallState();
      }),

      onFrame("call-offer", async (frame) => {
        const remoteUserId = frame.fromUserId;
        const politeKnown = politeRef.current.has(remoteUserId);
        const polite = politeKnown ? politeRef.current.get(remoteUserId)! : true;
        const pc = getOrCreatePeer(remoteUserId, polite);

        const offerCollision = makingOfferRef.current.get(remoteUserId) || pc.signalingState !== "stable";
        const ignoreOffer = !polite && offerCollision;
        ignoreOfferRef.current.set(remoteUserId, ignoreOffer);
        if (ignoreOffer) return;

        await pc.setRemoteDescription(frame.sdp);
        await flushPendingCandidates(remoteUserId, pc);
        await pc.setLocalDescription();
        sendFrame({
          type: "call-answer",
          roomId: currentRoomIdRef.current,
          targetUserId: remoteUserId,
          sdp: pc.localDescription,
        });
      }),

      onFrame("call-answer", async (frame) => {
        const pc = peersRef.current.get(frame.fromUserId);
        if (!pc) return;
        await pc.setRemoteDescription(frame.sdp);
        await flushPendingCandidates(frame.fromUserId, pc);
      }),

      onFrame("call-ice-candidate", async (frame) => {
        const pc = peersRef.current.get(frame.fromUserId);
        if (pc?.remoteDescription) {
          try {
            await pc.addIceCandidate(frame.candidate);
          } catch {
            if (!ignoreOfferRef.current.get(frame.fromUserId)) {
              // valódi hiba (nem egy figyelmen kívül hagyott ajánlat mellékterméke) — elnyeljük, a hívás így is folytatódhat
            }
          }
        } else {
          const list = pendingCandidatesRef.current.get(frame.fromUserId) ?? [];
          list.push(frame.candidate);
          pendingCandidatesRef.current.set(frame.fromUserId, list);
        }
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFrame, sendFrame, auth, peer, resolveName]);

  // Kezdeti (és reconnect utáni) snapshot az összes látható szoba aktív
  // hívásairól — utána a call-roster-updated frame-ek tartják élőben.
  useEffect(() => {
    if (!token) return;
    fetchActiveCalls(token).then((calls) => {
      setRoomRosters((prev) => {
        const next = new Map(prev);
        for (const call of calls) {
          next.set(
            call.roomId,
            call.participants.map((p) => ({ userId: p.userId, name: resolveName(p.userId), sharingScreen: p.sharingScreen }))
          );
        }
        return next;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <CallContext.Provider
      value={{
        status,
        roomId,
        peer,
        participants: Array.from(participants.values()),
        muted,
        sharingScreen,
        localScreenStream,
        roomRosters,
        joinCall,
        leaveCall,
        acceptCall,
        rejectCall,
        toggleMute,
        toggleScreenShare,
      }}
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
