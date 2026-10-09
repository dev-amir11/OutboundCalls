"use client";

import { useEffect, useRef, useState } from "react";
import {
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isAmdDataMessage, isSttLogMessage, refineAmdCategory, talkCategories, type AmdCategory } from "@/providers/livekit/amd";
import { disconnectReasonLabel } from "@/providers/livekit/dial";

type Phase = "idle" | "dialing" | "ringing" | "detecting" | "talking" | "voicemail" | "ended" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  dialing: "Dialing",
  ringing: "Ringing",
  detecting: "AMD detecting",
  talking: "Talking",
  voicemail: "Leaving voicemail",
  ended: "Call ended",
  error: "Call failed",
};

const PIPELINE: { id: Phase; label: string }[] = [
  { id: "dialing", label: "Dial" },
  { id: "ringing", label: "Ring" },
  { id: "detecting", label: "AMD" },
  { id: "talking", label: "Talk" },
  { id: "voicemail", label: "Voicemail" },
  { id: "ended", label: "End" },
];

const AMD_LABEL: Record<AmdCategory, string> = {
  human: "Human",
  uncertain: "Uncertain (treat as human)",
  "machine-ivr": "IVR / menu",
  "machine-vm": "Voicemail machine",
  "machine-unavailable": "Mailbox unavailable",
};

const AMD_TIMEOUT_MS = 45_000;

type StatusEvent = { id: number; at: string; text: string };

class CallSound {
  private ctx: AudioContext;
  private voicemailBuffer: AudioBuffer | null = null;
  private humanBuffer: AudioBuffer | null = null;

  constructor() {
    this.ctx = new AudioContext();
    void this.ctx.resume();
  }

  async loadVoicemail(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Voicemail audio could not be loaded.");
    this.voicemailBuffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
  }

  async loadHumanAnswer(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Human-answer audio could not be loaded.");
    this.humanBuffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
  }

  hasVoicemail() {
    return this.voicemailBuffer !== null;
  }

  hasHumanAnswer() {
    return this.humanBuffer !== null;
  }

  /** @deprecated use hasVoicemail */
  hasMessage() {
    return this.hasVoicemail();
  }

  private playBuffer(buffer: AudioBuffer) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const destination = this.ctx.createMediaStreamDestination();
    source.connect(this.ctx.destination);
    source.connect(destination);
    source.start();
    const track = destination.stream.getAudioTracks()[0];
    return {
      track,
      done: new Promise<void>((resolve) => {
        source.onended = () => resolve();
      }),
    };
  }

  /** Publish voicemail into the call and play it locally (remote audio should be muted first). */
  playMessage() {
    if (!this.voicemailBuffer) throw new Error("Voicemail audio is not ready.");
    return this.playBuffer(this.voicemailBuffer);
  }

  /** Publish human-answer greeting into the call and play it locally. */
  playHumanAnswer() {
    if (!this.humanBuffer) throw new Error("Human-answer audio is not ready.");
    return this.playBuffer(this.humanBuffer);
  }

  close() {
    void this.ctx.close();
  }
}

export function LiveCallPanel({
  voicemailName,
  humanAnswerName,
}: {
  voicemailName: string | null;
  humanAnswerName?: string | null;
}) {
  const [phone, setPhone] = useState("6466311744");
  const [usePrefix, setUsePrefix] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState(
    [
      "LiveKit AMD decides who answered.",
      humanAnswerName
        ? `Human → leave “${humanAnswerName}” (then hang up).`
        : "Human → set an active human-answer message to leave one (otherwise you talk).",
      voicemailName
        ? `Machine → leave “${voicemailName}”.`
        : "Machine → set an active voicemail before a drop can be left.",
    ].join(" "),
  );
  const [sipStatus, setSipStatus] = useState<string>("—");
  const [amdResult, setAmdResult] = useState<AmdCategory | null>(null);
  const [amdEnabled, setAmdEnabled] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const loggedDisconnectRef = useRef(false);
  const roomRef = useRef<Room | null>(null);
  const roomNameRef = useRef<string | null>(null);
  const soundRef = useRef<CallSound | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const talkingRef = useRef(false);
  const modeRef = useRef<"talk" | "voicemail" | null>(null);
  const dropOnAnswerRef = useRef(false);
  const amdEnabledRef = useRef(false);
  const amdDoneRef = useRef(false);
  const answeredRef = useRef(false);
  const lastSipRef = useRef<string>("");
  const sessionIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const deletedRoomRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const amdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);

  function pushEvent(text: string) {
    const at = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    eventIdRef.current += 1;
    const id = eventIdRef.current;
    setEvents((prev) => [...prev.slice(-80), { id, at, text }]);
  }

  function pushJson(label: string, value: unknown) {
    try {
      pushEvent(`${label} ${JSON.stringify(value)}`);
    } catch {
      pushEvent(`${label} ${String(value)}`);
    }
  }

  function setStatus(next: Phase, message: string) {
    setPhase(next);
    setDetail(message);
    pushEvent(message);
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [events]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      if (amdTimerRef.current) clearTimeout(amdTimerRef.current);
      soundRef.current?.close();
      micRef.current?.getTracks().forEach((track) => track.stop());
      roomRef.current?.disconnect();
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  }

  function clearAmdTimer() {
    if (amdTimerRef.current) clearTimeout(amdTimerRef.current);
    amdTimerRef.current = null;
  }

  function clearRemoteAudio() {
    const host = hostRef.current;
    if (!host) return;
    for (const child of [...host.children]) {
      if (child instanceof HTMLMediaElement) {
        child.pause();
        child.srcObject = null;
        child.remove();
      } else {
        child.remove();
      }
    }
  }

  function attachRemoteAudio(track: RemoteTrack) {
    const host = hostRef.current;
    if (!host) return;
    // One remote stream at a time — avoids stacking overlapping audio elements.
    clearRemoteAudio();
    const element = track.attach();
    element.autoplay = true;
    element.muted = modeRef.current === "voicemail";
    element.setAttribute("data-remote-audio", "phone");
    host.appendChild(element);
    void element.play().catch(() => undefined);
  }

  /** Attach phone SIP audio already in the room (early media / ringback). */
  function attachExistingPhoneAudio(room: Room) {
    for (const participant of room.remoteParticipants.values()) {
      if (!participant.identity.startsWith("phone-")) continue;
      for (const publication of participant.audioTrackPublications.values()) {
        const track = publication.track;
        if (track) {
          attachRemoteAudio(track);
          pushEvent("Hearing audio from the receiver (ringback / early media).");
          return;
        }
      }
    }
  }

  function muteRemoteAudio(muted: boolean) {
    const host = hostRef.current;
    if (!host) return;
    for (const child of host.children) {
      if (child instanceof HTMLMediaElement) child.muted = muted;
    }
  }

  function releaseLocalMedia() {
    soundRef.current?.close();
    soundRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    clearRemoteAudio();
  }

  function endRoom(name: string | undefined, next: Phase, message: string) {
    if (!name || deletedRoomRef.current === name) return;
    deletedRoomRef.current = name;
    void fetch("/api/calls/listen", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomName: name,
        outcome: next === "error" ? "FAILED" : "HUNG_UP",
        reason: message,
      }),
    }).catch(() => undefined);
  }

  function hangup(roomName: string | undefined, next: Phase, message: string) {
    const name = roomName ?? roomNameRef.current ?? undefined;
    if (cancelledRef.current) {
      endRoom(name, next, message);
      return;
    }
    cancelledRef.current = true;
    stopPolling();
    clearAmdTimer();
    releaseLocalMedia();
    const room = roomRef.current;
    roomRef.current = null;
    roomNameRef.current = null;
    setStatus(next, message);
    endRoom(name, next, message);
    room?.disconnect();
  }

  function noteSession(kind: string, message: string) {
    const sessionId = sessionIdRef.current;
    if (!sessionId) return;
    void fetch("/api/calls/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, kind, message }),
    }).catch(() => undefined);
  }

  async function playHumanAnswerDrop(room: Room) {
    if (cancelledRef.current || modeRef.current) return;
    const sound = soundRef.current;
    if (!sound?.hasHumanAnswer()) {
      setDetail("Set an active human-answer message under Human Answer Messages. Opening talk instead.");
      pushEvent("No active human-answer message — opening talk instead.");
      await beginTalking(room);
      return;
    }
    modeRef.current = "talk";
    talkingRef.current = true;
    muteRemoteAudio(true);
    micRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    setStatus(
      "talking",
      humanAnswerName ? `Playing human-answer “${humanAnswerName}”.` : "Playing the human-answer message.",
    );
    noteSession(
      "AGENT",
      humanAnswerName ? `Playing human-answer “${humanAnswerName}”.` : "Playing human-answer message.",
    );
    pushEvent(
      humanAnswerName
        ? `Playing human-answer message “${humanAnswerName}”.`
        : "Playing human-answer message.",
    );
    try {
      const playback = sound.playHumanAnswer();
      if (playback.track) {
        await room.localParticipant.publishTrack(playback.track, { name: "human-answer" });
      }
      await playback.done;
      if (!cancelledRef.current) hangup(room.name, "ended", "Human-answer message left.");
    } catch {
      if (!cancelledRef.current) hangup(room.name, "error", "The human-answer message could not be played.");
    }
  }

  async function beginTalking(room: Room) {
    if (modeRef.current || cancelledRef.current) return;
    modeRef.current = "talk";
    talkingRef.current = true;
    const tracks = micRef.current?.getAudioTracks() ?? [];
    for (const track of tracks) track.enabled = true;
    if (tracks[0]) {
      try {
        await room.localParticipant.publishTrack(tracks[0], { name: "microphone" });
      } catch {
        if (!cancelledRef.current) hangup(room.name, "ended", "The other side hung up.");
      }
    }
    if (cancelledRef.current) return;
    muteRemoteAudio(false);
    setStatus("talking", "Human answered. Speak into your microphone. You should hear them here.");
    pushEvent("Microphone open — you can talk.");
  }

  async function leaveVoicemail(room: Room) {
    if (cancelledRef.current || modeRef.current === "voicemail") return;
    const sound = soundRef.current;
    if (!sound?.hasVoicemail()) {
      setDetail("Set an active voicemail under Voicemail Messages. You can keep talking.");
      pushEvent("No active voicemail message — opening talk instead.");
      if (!modeRef.current) await beginTalking(room);
      return;
    }
    modeRef.current = "voicemail";
    talkingRef.current = true;
    micRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    // Hear the carrier greeting / beep first, then drop our public WAV.
    muteRemoteAudio(false);
    const greetingWaitMs = 4500;
    setStatus(
      "voicemail",
      `Mailbox greeting — waiting ${Math.round(greetingWaitMs / 1000)}s for beep, then leaving “${voicemailName ?? "voicemail"}”.`,
    );
    pushEvent(`Waiting ${Math.round(greetingWaitMs / 1000)}s for mailbox greeting/beep before drop…`);
    noteSession("VOICEMAIL", voicemailName ? `Waiting for beep, then leaving “${voicemailName}”.` : "Waiting for beep, then leaving a voicemail.");
    await new Promise<void>((resolve) => setTimeout(resolve, greetingWaitMs));
    if (cancelledRef.current) return;
    muteRemoteAudio(true);
    pushEvent("Remote audio muted — playing desk voicemail into the call.");
    setStatus("voicemail", voicemailName ? `Leaving voicemail “${voicemailName}”.` : "Leaving the voicemail.");
    try {
      const playback = sound.playMessage();
      if (playback.track) await room.localParticipant.publishTrack(playback.track, { name: "voicemail" });
      await playback.done;
      if (!cancelledRef.current) hangup(room.name, "ended", "Voicemail left.");
    } catch {
      if (!cancelledRef.current) hangup(room.name, "error", "The voicemail could not be played.");
    }
  }

  async function applyAmd(room: Room, category: AmdCategory, reason?: string, transcript?: string) {
    if (cancelledRef.current || amdDoneRef.current || modeRef.current) return;
    const refined = refineAmdCategory(category, transcript);
    amdDoneRef.current = true;
    clearAmdTimer();
    setAmdResult(refined.category);
    if (transcript?.trim()) setLastTranscript(transcript.trim());
    const label = AMD_LABEL[refined.category];
    noteSession(
      "AMD",
      `AMD classified as ${refined.category}${refined.reason || reason ? ` (${refined.reason ?? reason})` : ""}${transcript ? ` — “${transcript.slice(0, 160)}”` : ""}.`,
    );
    pushEvent(`AMD result: ${label}${refined.reason || reason ? ` — ${refined.reason ?? reason}` : ""}`);
    if (transcript?.trim()) pushEvent(`STT final: “${transcript.trim()}”`);

    if (dropOnAnswerRef.current) {
      pushEvent("Manual leave-voicemail override.");
      await leaveVoicemail(room);
      return;
    }
    if (refined.category === "machine-vm") {
      await leaveVoicemail(room);
      return;
    }
    if (refined.category === "machine-unavailable") {
      hangup(room.name, "ended", "Mailbox unavailable. No voicemail left.");
      return;
    }
    if (talkCategories(refined.category)) {
      await playHumanAnswerDrop(room);
    }
  }

  function armVoicemail() {
    const room = roomRef.current;
    if (!soundRef.current?.hasVoicemail()) {
      setDetail("Set an active voicemail under Voicemail Messages first.");
      pushEvent("Cannot leave voicemail — no active message.");
      return;
    }
    dropOnAnswerRef.current = true;
    pushEvent("Leave voicemail armed.");
    if (room && modeRef.current === "talk") {
      void leaveVoicemail(room);
      return;
    }
    if (room && answeredRef.current && !modeRef.current) {
      void leaveVoicemail(room);
      return;
    }
    setDetail("Voicemail will play when AMD finishes or the call is answered.");
  }

  function onAnswered(room: Room) {
    if (cancelledRef.current || answeredRef.current) return;
    answeredRef.current = true;
    setSipStatus("active");
    pushEvent("Call answered (SIP active).");

    if (dropOnAnswerRef.current) {
      void leaveVoicemail(room);
      return;
    }

    if (!amdEnabledRef.current) {
      pushEvent("AMD agent not available — leaving human-answer message.");
      void playHumanAnswerDrop(room);
      return;
    }

    setStatus("detecting", "Call answered. LiveKit AMD is detecting human vs machine…");
    clearAmdTimer();
    amdTimerRef.current = setTimeout(() => {
      if (cancelledRef.current || amdDoneRef.current) return;
      void applyAmd(room, "uncertain", "amd_timeout");
    }, AMD_TIMEOUT_MS);
  }

  function watch(roomName: string, room: Room) {
    const tick = async () => {
      if (cancelledRef.current) return;
      let response: Response;
      try {
        response = await fetch(`/api/calls/listen?room=${encodeURIComponent(roomName)}`, { signal: AbortSignal.timeout(4000) });
      } catch {
        if (!cancelledRef.current) pollRef.current = setTimeout(() => void tick(), 1000);
        return;
      }
      const body = (await response.json()) as {
        status?: string;
        roomExists?: boolean;
        error?: string;
        attributes?: Record<string, string>;
        disconnectReason?: string | null;
        sipCallId?: string | null;
        phonePresent?: boolean;
      };
      if (cancelledRef.current) return;
      if (!response.ok) {
        hangup(roomName, "error", body.error || "Could not read the call.");
        return;
      }
      const status = body.status ?? "";
      const attrKey = body.attributes ? JSON.stringify(body.attributes) : "";
      const detailKey = `${status}|${body.disconnectReason ?? ""}|${attrKey}`;
      if (status && status !== "pending" && lastSipRef.current !== detailKey) {
        lastSipRef.current = detailKey;
        setSipStatus(status);
        pushEvent(`SIP status: ${status}`);
        if (body.sipCallId) pushEvent(`SIP call id: ${body.sipCallId}`);
        if (body.disconnectReason && status !== "dialing" && status !== "ringing" && status !== "active") {
          pushEvent(`Disconnect reason: ${body.disconnectReason}`);
        }
        if (body.attributes && Object.keys(body.attributes).length) {
          pushJson("UScare/SIP attributes", body.attributes);
        }
      }
      if (status === "pending") {
        pollRef.current = setTimeout(() => void tick(), 1000);
        return;
      }
      if (!body.roomExists || status === "hangup" || status === "disconnected") {
        if (body.disconnectReason && !loggedDisconnectRef.current) {
          loggedDisconnectRef.current = true;
          pushEvent(`Gateway/SIP result: ${body.disconnectReason}`);
        }
        const endedEarly =
          modeRef.current === "voicemail"
            ? "The mailbox hung up before the voicemail finished."
            : talkingRef.current
              ? "The other side hung up."
              : body.disconnectReason
                ? `Call ended: ${body.disconnectReason}`
                : "The call ended before they answered.";
        hangup(roomName, "ended", endedEarly);
        return;
      }
      if (status === "ringing" && !answeredRef.current) {
        setPhase((current) => (current === "dialing" ? "ringing" : current));
      }
      if (status === "active") {
        onAnswered(room);
      }
      pollRef.current = setTimeout(() => void tick(), 1000);
    };
    pollRef.current = setTimeout(() => void tick(), 800);
  }

  async function onCall() {
    if (phase === "dialing" || phase === "ringing" || phase === "detecting" || phase === "talking" || phase === "voicemail") return;
    cancelledRef.current = false;
    talkingRef.current = false;
    modeRef.current = null;
    dropOnAnswerRef.current = false;
    amdEnabledRef.current = false;
    setAmdEnabled(false);
    amdDoneRef.current = false;
    answeredRef.current = false;
    lastSipRef.current = "";
    loggedDisconnectRef.current = false;
    sessionIdRef.current = null;
    deletedRoomRef.current = null;
    setAmdResult(null);
    setLastTranscript("");
    setSipStatus("—");
    setEvents([]);
    eventIdRef.current = 0;
    clearAmdTimer();

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("error", "Allow the microphone so you can talk once a person answers.");
      return;
    }
    mic.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    micRef.current = mic;

    const sound = new CallSound();
    soundRef.current = sound;
    setStatus("dialing", "Starting outbound call… (no local beep — only audio from the receiver)");

    const requestBody = { phone, usePrefix };
    pushJson("Dial request", requestBody);

    const response = await fetch("/api/calls/listen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const rawText = await response.text();
    let body: {
      error?: string;
      roomName?: string;
      token?: string;
      url?: string;
      display?: string;
      callerId?: string;
      dialed?: string;
      sessionId?: string;
      amd?: boolean;
      voicemailUrl?: string | null;
      voicemailName?: string | null;
      humanAnswerUrl?: string | null;
      humanAnswerName?: string | null;
      usePrefix?: boolean;
      dialPrefix?: string;
      trunkId?: string;
      trunkName?: string | null;
      gateway?: string | null;
      sipCallId?: string | null;
      sipRequest?: unknown;
      sipHttpStatus?: number;
      sipResponse?: unknown;
      liveKitHost?: string;
    } = {};
    try {
      body = rawText ? (JSON.parse(rawText) as typeof body) : {};
    } catch {
      releaseLocalMedia();
      setStatus(
        "error",
        `Place-call API returned non-JSON (HTTP ${response.status}). ${rawText.slice(0, 160) || "Empty body — usually LIVEKIT_URL unreachable."}`,
      );
      return;
    }
    pushEvent(`HTTP status: ${response.status}`);
    if (body.sipRequest) pushJson("CreateSIPParticipant request", body.sipRequest);
    if (body.sipResponse) pushJson("CreateSIPParticipant response", body.sipResponse);
    if (body.gateway || body.trunkName) {
      pushEvent(
        `UScare/gateway: ${body.trunkName ?? "trunk"} @ ${body.gateway ?? "unknown"} (${body.trunkId ?? "no trunk id"})`,
      );
    }
    if (body.dialed) {
      pushEvent(
        body.usePrefix
          ? `Dialed with prefix${body.dialPrefix ? ` ${body.dialPrefix}` : ""}: ${body.dialed}`
          : `Dialed without prefix: ${body.dialed}`,
      );
    }
    if (body.sipCallId) pushEvent(`SIP call id: ${body.sipCallId}`);

    if (cancelledRef.current) {
      if (body.roomName) hangup(body.roomName, "ended", "You hung up.");
      else releaseLocalMedia();
      return;
    }
    if (!response.ok || !body.roomName || !body.token || !body.url) {
      releaseLocalMedia();
      const failDetail = [
        body.error || "The call could not be started.",
        body.sipHttpStatus ? `sipHttpStatus=${body.sipHttpStatus}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setStatus("error", failDetail);
      return;
    }
    roomNameRef.current = body.roomName;
    sessionIdRef.current = body.sessionId ?? null;
    amdEnabledRef.current = Boolean(body.amd);
    setAmdEnabled(Boolean(body.amd));
    pushEvent(body.amd ? "AMD agent dispatched." : "AMD agent not running — talk-only fallback.");
    setSipStatus("dialing");
    const messageReady = Promise.all([
      body.voicemailUrl ? sound.loadVoicemail(body.voicemailUrl).catch(() => undefined) : Promise.resolve(),
      body.humanAnswerUrl ? sound.loadHumanAnswer(body.humanAnswerUrl).catch(() => undefined) : Promise.resolve(),
    ]);
    if (body.humanAnswerName) {
      pushEvent(`Active human-answer: ${body.humanAnswerName}`);
    }

    const room = new Room({ singlePeerConnection: false });
    roomRef.current = room;
    const remoteGone = () => {
      if (roomRef.current !== room) return;
      const endedEarly =
        modeRef.current === "voicemail"
          ? "The mailbox hung up before the voicemail finished."
          : talkingRef.current
            ? "The other side hung up."
            : "The call ended before they answered.";
      hangup(room.name, "ended", endedEarly);
    };
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant, reason?: DisconnectReason) => {
      if (!participant.identity.startsWith("phone-")) return;
      const label = disconnectReasonLabel(reason);
      if (label && !loggedDisconnectRef.current) {
        loggedDisconnectRef.current = true;
        pushEvent(`UScare/SIP disconnect: ${label}`);
        setSipStatus(label);
      }
      remoteGone();
    });
    room.on(RoomEvent.Disconnected, () => remoteGone());
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio || !hostRef.current) return;
      if (!participant.identity.startsWith("phone-")) return;
      // Skip agent / other non-phone audio so it never overlaps the callee.
      if (modeRef.current === "voicemail") {
        // Keep remote muted while we drop our message.
        attachRemoteAudio(track);
        muteRemoteAudio(true);
        pushEvent("Remote audio muted while leaving voicemail.");
        return;
      }
      attachRemoteAudio(track);
      pushEvent("Hearing audio from the receiver (ringback / call audio).");
    });
    room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
      if (cancelledRef.current) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      if (isSttLogMessage(parsed)) {
        const text = parsed.transcript.trim();
        if (!text) return;
        setLastTranscript(text);
        pushEvent(`${parsed.isFinal ? "STT" : "STT…"}: “${text}”`);
        return;
      }
      if (!isAmdDataMessage(parsed) || amdDoneRef.current) return;
      pushEvent("AMD result received from agent.");
      void applyAmd(room, parsed.category, parsed.reason, parsed.transcript);
    });

    try {
      await Promise.all([room.connect(body.url, body.token), messageReady]);
      if (body.sessionId) {
        await fetch("/api/calls/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: body.sessionId, kind: "JOINED", message: "You joined the call." }),
        }).catch(() => undefined);
      }
      attachExistingPhoneAudio(room);
      setStatus(
        "ringing",
        `Ringing ${body.display}. Only remote ringback/voice is played (nothing generated locally). Caller ID ${body.callerId}.`,
      );
      watch(body.roomName, room);
    } catch (error) {
      hangup(body.roomName, "error", error instanceof Error ? error.message : "Could not join the call audio.");
    }
  }

  const busy = phase === "dialing" || phase === "ringing" || phase === "detecting" || phase === "talking" || phase === "voicemail";

  function stepState(stepId: Phase): "done" | "current" | "todo" {
    if (phase === "idle") return "todo";
    if (stepId === "dialing") {
      if (phase === "dialing") return "current";
      return "done";
    }
    if (stepId === "ringing") {
      if (phase === "dialing") return "todo";
      if (phase === "ringing") return "current";
      return "done";
    }
    if (stepId === "detecting") {
      if (phase === "dialing" || phase === "ringing") return "todo";
      if (phase === "detecting") return "current";
      if (!amdEnabled) return phase === "error" ? "todo" : "done";
      return "done";
    }
    if (stepId === "talking") {
      if (phase === "talking") return "current";
      if (phase === "ended" && amdResult !== "machine-vm" && amdResult !== "machine-unavailable") return "done";
      if (phase === "voicemail" || amdResult === "machine-vm" || amdResult === "machine-unavailable") return "todo";
      return "todo";
    }
    if (stepId === "voicemail") {
      if (phase === "voicemail") return "current";
      if (amdResult === "machine-vm" && (phase === "ended" || phase === "error")) return "done";
      return "todo";
    }
    if (stepId === "ended") {
      if (phase === "ended" || phase === "error") return "current";
      return "todo";
    }
    return "todo";
  }

  return (
    <section className="max-w-xl rounded-xl border border-white/10 bg-[#161b24] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">Status</p>
        <p className="text-sm font-medium text-teal-300">{PHASE_LABEL[phase]}</p>
      </div>
      <p className="mt-2 min-h-10 text-sm text-zinc-200">{detail}</p>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-400 sm:grid-cols-3">
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <p className="text-zinc-500">SIP</p>
          <p className="mt-1 font-medium text-zinc-200">{sipStatus}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <p className="text-zinc-500">AMD</p>
          <p className="mt-1 font-medium text-zinc-200">
            {amdResult ? AMD_LABEL[amdResult] : phase === "detecting" ? "Listening…" : amdEnabled && busy ? "Waiting" : "—"}
          </p>
        </div>
        <div className="col-span-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 sm:col-span-1">
          <p className="text-zinc-500">STT</p>
          <p className="mt-1 line-clamp-2 font-medium text-zinc-200">{lastTranscript || "—"}</p>
        </div>
      </div>

      <ol className="mt-4 flex flex-wrap gap-2">
        {PIPELINE.map((step) => {
          const state = stepState(step.id);
          return (
            <li
              key={step.id}
              className={
                state === "current"
                  ? "rounded-full border border-teal-400/40 bg-teal-400/10 px-3 py-1 text-xs font-medium text-teal-200"
                  : state === "done"
                    ? "rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300"
                    : "rounded-full border border-white/5 px-3 py-1 text-xs text-zinc-600"
              }
            >
              {step.label}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 rounded-lg border border-white/10 bg-black/30">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Live log</p>
          <p className="text-xs text-zinc-600">{events.length ? `${events.length} events` : "Waiting"}</p>
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed">
          {events.length === 0 ? (
            <p className="text-zinc-600">Dial request, UScare gateway response, and SIP status will appear here.</p>
          ) : (
            events.map((event) => (
              <p key={event.id} className="break-all text-zinc-300">
                <span className="text-zinc-500">{event.at}</span> <span>{event.text}</span>
              </p>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      <div ref={hostRef} className="hidden" />
      <div className="mt-5 grid gap-2">
        <Label htmlFor="call-phone">Phone number</Label>
        <Input
          id="call-phone"
          value={phone}
          inputMode="tel"
          autoComplete="tel"
          disabled={busy}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
        <span className="text-zinc-500">Dial prefix</span>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="dial-prefix"
            checked={usePrefix}
            disabled={busy}
            onChange={() => setUsePrefix(true)}
          />
          With prefix (DIAL_PREFIX)
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="dial-prefix"
            checked={!usePrefix}
            disabled={busy}
            onChange={() => setUsePrefix(false)}
          />
          Without prefix
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <Button type="button" onClick={() => void onCall()} disabled={busy}>
          Call
        </Button>
        <Button type="button" variant="secondary" disabled={!busy || phase === "voicemail" || !voicemailName} onClick={armVoicemail}>
          Leave voicemail
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={!busy}
          onClick={() => hangup(roomNameRef.current ?? undefined, "ended", phase === "voicemail" ? "Voicemail stopped." : "You hung up.")}
        >
          Hang up
        </Button>
      </div>
      <p className="mt-3 text-sm text-zinc-400">
        {voicemailName ? `Active voicemail: ${voicemailName}` : "No active voicemail. Add one under Voicemail Messages."}
        {" · "}
        {humanAnswerName
          ? `Active human-answer: ${humanAnswerName}`
          : "No active human-answer. Add one under Human Answer Messages."}
      </p>
    </section>
  );
}
