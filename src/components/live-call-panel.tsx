"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Phase = "idle" | "ringing" | "talking" | "voicemail" | "ended" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  ringing: "Ringing",
  talking: "Talking",
  voicemail: "Voicemail",
  ended: "Call ended",
  error: "Call failed",
};

const MAILBOX_AFTER_MS = 20_000;

class CallSound {
  private ctx: AudioContext;
  private ringGain: GainNode;
  private oscillators: OscillatorNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ringing = false;
  private buffer: AudioBuffer | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.ringGain = this.ctx.createGain();
    this.ringGain.gain.value = 0;
    this.ringGain.connect(this.ctx.destination);
    void this.ctx.resume();
  }

  startRing() {
    this.stopRing();
    for (const frequency of [440, 480]) {
      const oscillator = this.ctx.createOscillator();
      oscillator.frequency.value = frequency;
      oscillator.connect(this.ringGain);
      oscillator.start();
      this.oscillators.push(oscillator);
    }
    this.ringing = false;
    this.pulse();
  }

  async loadMessage(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Voicemail audio could not be loaded.");
    this.buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
  }

  hasMessage() {
    return this.buffer !== null;
  }

  playMessage() {
    if (!this.buffer) throw new Error("Voicemail audio is not ready.");
    this.stopRing();
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
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

  stopRing() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ringGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.01);
    for (const oscillator of this.oscillators) oscillator.stop();
    this.oscillators = [];
  }

  close() {
    this.stopRing();
    void this.ctx.close();
  }

  private pulse() {
    this.ringing = !this.ringing;
    this.ringGain.gain.setTargetAtTime(this.ringing ? 0.06 : 0, this.ctx.currentTime, 0.015);
    this.timer = setTimeout(() => this.pulse(), this.ringing ? 2000 : 4000);
  }
}

export function LiveCallPanel({ voicemailName }: { voicemailName: string | null }) {
  const [phone, setPhone] = useState("6466311744");
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState(
    voicemailName
      ? `If someone picks up, you talk. If the mailbox answers after a long ring, “${voicemailName}” is left.`
      : "If someone picks up, you talk. Set an active voicemail message before unanswered calls can leave one.",
  );
  const roomRef = useRef<Room | null>(null);
  const roomNameRef = useRef<string | null>(null);
  const soundRef = useRef<CallSound | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const talkingRef = useRef(false);
  const modeRef = useRef<"talk" | "voicemail" | null>(null);
  const dropOnAnswerRef = useRef(false);
  const ringStartedRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  const deletedRoomRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
      soundRef.current?.close();
      micRef.current?.getTracks().forEach((track) => track.stop());
      roomRef.current?.disconnect();
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
  }

  function releaseLocalMedia() {
    soundRef.current?.close();
    soundRef.current = null;
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
    hostRef.current?.replaceChildren();
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
    releaseLocalMedia();
    const room = roomRef.current;
    roomRef.current = null;
    roomNameRef.current = null;
    setPhase(next);
    setDetail(message);
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

  async function beginTalking(room: Room) {
    if (modeRef.current || cancelledRef.current) return;
    modeRef.current = "talk";
    talkingRef.current = true;
    soundRef.current?.stopRing();
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
    setPhase("talking");
    setDetail("He answered. Speak into your microphone. You should hear him here.");
  }

  async function leaveVoicemail(room: Room) {
    if (cancelledRef.current || modeRef.current === "voicemail") return;
    const sound = soundRef.current;
    if (!sound?.hasMessage()) {
      setDetail("Set an active voicemail under Voicemail Messages. You can keep talking.");
      if (!modeRef.current) await beginTalking(room);
      return;
    }
    modeRef.current = "voicemail";
    talkingRef.current = true;
    sound.stopRing();
    micRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    setPhase("voicemail");
    setDetail(voicemailName ? `Leaving “${voicemailName}”.` : "Leaving the voicemail.");
    noteSession("VOICEMAIL", voicemailName ? `Leaving voicemail “${voicemailName}”.` : "Leaving a voicemail.");
    try {
      const playback = sound.playMessage();
      if (playback.track) await room.localParticipant.publishTrack(playback.track, { name: "voicemail" });
      await playback.done;
      if (!cancelledRef.current) hangup(room.name, "ended", "Voicemail left.");
    } catch {
      if (!cancelledRef.current) hangup(room.name, "error", "The voicemail could not be played.");
    }
  }

  function armVoicemail() {
    const room = roomRef.current;
    if (!soundRef.current?.hasMessage()) {
      setDetail("Set an active voicemail under Voicemail Messages first.");
      return;
    }
    dropOnAnswerRef.current = true;
    if (room && modeRef.current === "talk") {
      void leaveVoicemail(room);
      return;
    }
    setDetail("Voicemail will play when the mailbox answers.");
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
      const body = (await response.json()) as { status?: string; roomExists?: boolean; error?: string };
      if (cancelledRef.current) return;
      if (!response.ok) {
        hangup(roomName, "error", body.error || "Could not read the call.");
        return;
      }
      const status = body.status ?? "";
      if (status === "ringing" && ringStartedRef.current === null) ringStartedRef.current = Date.now();
      if (status === "pending") {
        pollRef.current = setTimeout(() => void tick(), 1000);
        return;
      }
      if (!body.roomExists || status === "hangup" || status === "disconnected") {
        const endedEarly = modeRef.current === "voicemail" ? "The mailbox hung up before the voicemail finished." : talkingRef.current ? "The other side hung up." : "The call ended before he answered.";
        hangup(roomName, "ended", endedEarly);
        return;
      }
      if (status === "active" || status === "automation") {
        const rangFor = ringStartedRef.current ? Date.now() - ringStartedRef.current : 0;
        const mailbox = status === "automation" || dropOnAnswerRef.current || rangFor >= MAILBOX_AFTER_MS;
        if (mailbox) await leaveVoicemail(room);
        else await beginTalking(room);
      }
      pollRef.current = setTimeout(() => void tick(), 1000);
    };
    pollRef.current = setTimeout(() => void tick(), 800);
  }

  async function onCall() {
    if (phase === "ringing" || phase === "talking" || phase === "voicemail") return;
    cancelledRef.current = false;
    talkingRef.current = false;
    modeRef.current = null;
    dropOnAnswerRef.current = false;
    ringStartedRef.current = null;
    sessionIdRef.current = null;
    deletedRoomRef.current = null;

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase("error");
      setDetail("Allow the microphone so you can talk once he answers.");
      return;
    }
    mic.getAudioTracks().forEach((track) => {
      track.enabled = false;
    });
    micRef.current = mic;

    const sound = new CallSound();
    soundRef.current = sound;
    sound.startRing();
    setPhase("ringing");
    setDetail("Dialing. You should hear ringing until he answers.");

    const response = await fetch("/api/calls/listen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const body = (await response.json()) as {
      error?: string;
      roomName?: string;
      token?: string;
      url?: string;
      display?: string;
      callerId?: string;
      sessionId?: string;
      voicemailUrl?: string | null;
      voicemailName?: string | null;
    };
    if (cancelledRef.current) {
      if (body.roomName) hangup(body.roomName, "ended", "You hung up.");
      else releaseLocalMedia();
      return;
    }
    if (!response.ok || !body.roomName || !body.token || !body.url) {
      releaseLocalMedia();
      setPhase("error");
      setDetail(body.error || "The call could not be started.");
      return;
    }
    roomNameRef.current = body.roomName;
    sessionIdRef.current = body.sessionId ?? null;
    const messageReady = body.voicemailUrl ? sound.loadMessage(body.voicemailUrl).catch(() => undefined) : Promise.resolve();

    const room = new Room({ singlePeerConnection: false });
    roomRef.current = room;
    const remoteGone = () => {
      if (roomRef.current !== room) return;
      const endedEarly = modeRef.current === "voicemail" ? "The mailbox hung up before the voicemail finished." : talkingRef.current ? "The other side hung up." : "The call ended before he answered.";
      hangup(room.name, "ended", endedEarly);
    };
    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      if (participant.identity.startsWith("phone-")) remoteGone();
    });
    room.on(RoomEvent.Disconnected, () => remoteGone());
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio || !hostRef.current) return;
      sound.stopRing();
      const element = track.attach();
      element.autoplay = true;
      hostRef.current.appendChild(element);
      void element.play().catch(() => undefined);
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
      const messageLabel = body.voicemailName ? ` Voicemail “${body.voicemailName}” plays if the mailbox answers after a long ring.` : "";
      setDetail(`Ringing ${body.display}. Caller ID ${body.callerId}.${messageLabel}`);
      watch(body.roomName, room);
    } catch (error) {
      hangup(body.roomName, "error", error instanceof Error ? error.message : "Could not join the call audio.");
    }
  }

  const busy = phase === "ringing" || phase === "talking" || phase === "voicemail";

  return (
    <section className="max-w-xl rounded-xl border border-white/10 bg-[#161b24] p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">Status</p>
        <p className="text-sm font-medium text-teal-300">{PHASE_LABEL[phase]}</p>
      </div>
      <p className="mt-2 min-h-10 text-sm text-zinc-200">{detail}</p>
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
      </p>
    </section>
  );
}
