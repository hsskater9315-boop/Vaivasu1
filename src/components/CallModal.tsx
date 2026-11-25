import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  addCallCandidate,
  answerCall,
  createCallOffer,
  subscribeCallCandidates,
  updateCallStatus,
} from '../services/firestoreChat';
import type { CallKind, CallSession, PublicUser } from '../types/chat';
import { playCallRingPulse } from '../utils/sound';
import { Avatar } from './Avatar';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface OutgoingCallRequest {
  roomId: string;
  callee: PublicUser;
  kind: CallKind;
}

interface CallModalProps {
  currentUser: PublicUser;
  liveCall: CallSession | null;
  outgoingRequest: OutgoingCallRequest | null;
  peerUser: PublicUser | null;
  soundMuted: boolean;
  onDismiss: () => void;
}

function formatCallDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CallModal({
  currentUser,
  liveCall,
  outgoingRequest,
  peerUser,
  soundMuted,
  onDismiss,
}: CallModalProps) {
  const isOpen = Boolean(liveCall || outgoingRequest);
  const isIncomingRinging = Boolean(
    liveCall && liveCall.calleeId === currentUser.id && liveCall.status === 'ringing',
  );
  const callKind: CallKind = liveCall?.kind ?? outgoingRequest?.kind ?? 'audio';

  const [connecting, setConnecting] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const outgoingIceBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const callIdRef = useRef<string | null>(null);
  const startedOutgoingRef = useRef(false);
  const answerAppliedRef = useRef(false);
  const candidateUnsubRef = useRef<(() => void) | null>(null);

  const attachLocalStream = useCallback((stream: MediaStream) => {
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
  }, []);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    remoteStreamRef.current = stream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = stream;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
    }
  }, []);

  const cleanupPeer = useCallback(() => {
    if (candidateUnsubRef.current) {
      candidateUnsubRef.current();
      candidateUnsubRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;
    pendingIceCandidatesRef.current = [];
    outgoingIceBufferRef.current = [];
    callIdRef.current = null;
    startedOutgoingRef.current = false;
    answerAppliedRef.current = false;
    setActiveCallId(null);
    setElapsedSec(0);
    setMicMuted(false);
    setCameraOff(false);
    setConnecting(false);
  }, []);

  const createPeerConnection = useCallback(
    (localStream: MediaStream) => {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const remoteStream = new MediaStream();
      attachRemoteStream(remoteStream);

      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }

      pc.ontrack = (ev) => {
        for (const track of ev.streams[0]?.getTracks() ?? [ev.track]) {
          if (!remoteStream.getTracks().some((t) => t.id === track.id)) {
            remoteStream.addTrack(track);
          }
        }
        attachRemoteStream(remoteStream);
      };

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        const json = ev.candidate.toJSON();
        if (callIdRef.current) {
          void addCallCandidate(callIdRef.current, currentUser.id, json);
        } else {
          outgoingIceBufferRef.current.push(json);
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [attachRemoteStream, currentUser.id],
  );

  const attachCandidateListener = useCallback(
    (callId: string) => {
      if (candidateUnsubRef.current) candidateUnsubRef.current();
      candidateUnsubRef.current = subscribeCallCandidates(callId, currentUser.id, (_id, cand) => {
        const pc = pcRef.current;
        if (!pc) return;
        if (pc.remoteDescription) {
          void pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        } else {
          pendingIceCandidatesRef.current.push(cand);
        }
      });
    },
    [currentUser.id],
  );

  // Sync ref elements if video mounts later
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
    }
  });

  // Initiate outgoing call
  useEffect(() => {
    if (!outgoingRequest || startedOutgoingRef.current) return;
    startedOutgoingRef.current = true;
    setCallError(null);
    setConnecting(true);

    let cancelled = false;

    async function beginOutgoing() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Calling requires camera/microphone permissions in a modern browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: outgoingRequest!.kind === 'video',
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        attachLocalStream(stream);
        const pc = createPeerConnection(stream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const newCallId = await createCallOffer({
          roomId: outgoingRequest!.roomId,
          callerId: currentUser.id,
          calleeId: outgoingRequest!.callee.id,
          kind: outgoingRequest!.kind,
          offer: {
            type: 'offer',
            sdp: offer.sdp || '',
          },
        });

        if (cancelled) {
          void updateCallStatus(newCallId, 'ended');
          return;
        }
        callIdRef.current = newCallId;
        setActiveCallId(newCallId);
        attachCandidateListener(newCallId);

        const buffered = [...outgoingIceBufferRef.current];
        outgoingIceBufferRef.current = [];
        for (const c of buffered) {
          void addCallCandidate(newCallId, currentUser.id, c);
        }
        setConnecting(false);
      } catch (err) {
        setConnecting(false);
        setCallError(
          err instanceof Error && !err.message.startsWith('{')
            ? err.message
            : 'Could not start call. Please allow microphone/camera access.',
        );
      }
    }

    void beginOutgoing();
    return () => {
      cancelled = true;
    };
  }, [
    outgoingRequest,
    currentUser.id,
    attachLocalStream,
    createPeerConnection,
    attachCandidateListener,
  ]);

  // Apply remote SDP answer when callee accepts
  useEffect(() => {
    if (!liveCall || liveCall.callerId !== currentUser.id) return;
    if (!callIdRef.current) {
      callIdRef.current = liveCall.id;
      setActiveCallId(liveCall.id);
    }
    if (liveCall.answer && !answerAppliedRef.current && pcRef.current) {
      answerAppliedRef.current = true;
      const pc = pcRef.current;
      void pc
        .setRemoteDescription(new RTCSessionDescription(liveCall.answer))
        .then(async () => {
          const queued = [...pendingIceCandidatesRef.current];
          pendingIceCandidatesRef.current = [];
          for (const c of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [liveCall, currentUser.id]);

  // Ringing pulse while ringing
  useEffect(() => {
    if (!isOpen || soundMuted) return;
    const isRinging =
      (outgoingRequest && (!liveCall || liveCall.status === 'ringing')) || isIncomingRinging;
    if (!isRinging) return;

    playCallRingPulse(!isIncomingRinging);
    const id = window.setInterval(() => {
      playCallRingPulse(!isIncomingRinging);
    }, 2200);
    return () => window.clearInterval(id);
  }, [isOpen, soundMuted, outgoingRequest, liveCall, isIncomingRinging]);

  // Active call duration timer
  useEffect(() => {
    if (!liveCall || liveCall.status !== 'active') return;
    setElapsedSec(0);
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [liveCall?.id, liveCall?.status]);

  // Auto-dismiss if call ended remotely
  useEffect(() => {
    if (!liveCall) return;
    if (liveCall.status === 'ended' || liveCall.status === 'declined' || liveCall.status === 'missed') {
      cleanupPeer();
      onDismiss();
    }
  }, [liveCall, cleanupPeer, onDismiss]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupPeer();
    };
  }, [cleanupPeer]);

  async function handleAcceptIncoming() {
    if (!liveCall || connecting) return;
    setConnecting(true);
    setCallError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Calling requires microphone/camera access in a modern browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: liveCall.kind === 'video',
      });
      attachLocalStream(stream);
      callIdRef.current = liveCall.id;
      setActiveCallId(liveCall.id);

      const pc = createPeerConnection(stream);
      attachCandidateListener(liveCall.id);
      await pc.setRemoteDescription(new RTCSessionDescription(liveCall.offer));

      const queued = [...pendingIceCandidatesRef.current];
      pendingIceCandidatesRef.current = [];
      for (const c of queued) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await answerCall(liveCall.id, {
        type: 'answer',
        sdp: answer.sdp || '',
      });
    } catch (err) {
      setCallError(
        err instanceof Error && !err.message.startsWith('{')
          ? err.message
          : 'Could not connect call.',
      );
    } finally {
      setConnecting(false);
    }
  }

  async function handleEndOrDecline() {
    const id = liveCall?.id ?? activeCallId ?? callIdRef.current;
    if (id) {
      const nextStatus = isIncomingRinging ? 'declined' : 'ended';
      await updateCallStatus(id, nextStatus);
    }
    cleanupPeer();
    onDismiss();
  }

  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !micMuted;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !next;
    }
    setMicMuted(next);
  }

  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !cameraOff;
    for (const track of stream.getVideoTracks()) {
      track.enabled = !next;
    }
    setCameraOff(next);
  }

  const displayName = peerUser?.displayName || outgoingRequest?.callee.displayName || 'Friend';
  const avatarColor = peerUser?.avatarColor || outgoingRequest?.callee.avatarColor || '#2563EB';
  const avatarUrl = peerUser?.avatarUrl ?? outgoingRequest?.callee.avatarUrl ?? null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label={callKind === 'video' ? 'Video call' : 'Audio call'}
        >
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            className="relative flex w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 text-white shadow-2xl"
          >
            {callKind === 'video' && !isIncomingRinging ? (
              <div className="relative aspect-[3/4] max-h-[68dvh] w-full bg-slate-950">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="h-full w-full object-cover"
                />
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="absolute right-3 bottom-3 h-32 w-24 rounded-xl border border-white/25 bg-slate-800 object-cover shadow-lg"
                />
                <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/75 to-transparent p-4">
                  <p className="text-sm font-semibold">{displayName}</p>
                  <p className="text-xs text-slate-300">
                    {liveCall?.status === 'active'
                      ? formatCallDuration(elapsedSec)
                      : connecting
                        ? 'Starting camera...'
                        : 'Ringing...'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center px-6 pt-10 pb-8 text-center">
                <div className="rounded-2xl ring-2 ring-blue-500/40 ring-offset-4 ring-offset-slate-900">
                  <Avatar
                    name={displayName}
                    color={avatarColor}
                    avatarUrl={avatarUrl}
                    size="lg"
                  />
                </div>
                <h2 className="mt-5 font-display text-xl font-semibold text-white">
                  {displayName}
                </h2>
                <p className="mt-1 text-sm text-slate-300">
                  {isIncomingRinging
                    ? `Incoming ${callKind === 'video' ? 'video' : 'audio'} call...`
                    : liveCall?.status === 'active'
                      ? formatCallDuration(elapsedSec)
                      : connecting
                        ? 'Connecting...'
                        : 'Ringing...'}
                </p>
              </div>
            )}

            {callError && (
              <div className="mx-5 mb-3 rounded-xl border border-red-500/40 bg-red-500/15 px-3 py-2 text-center text-xs text-red-200">
                {callError}
              </div>
            )}

            <div className="flex items-center justify-center gap-4 border-t border-slate-800 bg-slate-900/95 px-6 py-5">
              {isIncomingRinging ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleEndOrDecline()}
                    aria-label="Decline call"
                    className="flex h-13 w-13 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    <PhoneOff className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={() => void handleAcceptIncoming()}
                    aria-label="Accept call"
                    className="flex h-13 w-13 items-center justify-center rounded-full bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                  >
                    {callKind === 'video' ? (
                      <Video className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <PhoneIncoming className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                    className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                      micMuted
                        ? 'bg-white text-slate-900'
                        : 'bg-slate-800 text-white hover:bg-slate-700'
                    }`}
                  >
                    {micMuted ? (
                      <MicOff className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Mic className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>

                  {callKind === 'video' && (
                    <button
                      type="button"
                      onClick={toggleCamera}
                      aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                      className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                        cameraOff
                          ? 'bg-white text-slate-900'
                          : 'bg-slate-800 text-white hover:bg-slate-700'
                      }`}
                    >
                      {cameraOff ? (
                        <VideoOff className="h-5 w-5" aria-hidden="true" />
                      ) : (
                        <Video className="h-5 w-5" aria-hidden="true" />
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleEndOrDecline()}
                    aria-label="End call"
                    className="flex h-13 w-13 items-center justify-center rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    <Phone className="h-5 w-5 rotate-[135deg]" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
