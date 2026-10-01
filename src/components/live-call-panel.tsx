"use client";

import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from "livekit-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Phase = "idle" | "ringing" | "talking" | "ended" | "error";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Ready",
  ringing: "Ringing",
  talking: "Talking",
  ended: "Call ended",
  error: "Call failed",
};

class CallSound {
  private ctx: AudioContext;
  private ringGain: GainNode;
  private oscillators: OscillatorNode[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ringing = false;

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

export function LiveCallPanel() {
  const [phone, setPhone] = useState("6466311744");
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState("Enter a number and press Call. It rings until he answers, then you can talk.");
  const roomRef = useRef<Room | null>(null);
  const roomNameRef = useRef<string | null>(null);
  const soundRef = useRef<CallSound | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const talkingRef = useRef(false);
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

  async function beginTalking(room: Room) {
    if (talkingRef.current || cancelledRef.current) return;
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
    setPhase("talking");
    setDetail("He answered. Speak into your microphone. You should hear him here.");
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
      if (status === "pending") {
        pollRef.current = setTimeout(() => void tick(), 1000);
        return;
      }
      if (!body.roomExists || status === "hangup" || status === "disconnected") {
        hangup(roomName, "ended", talkingRef.current ? "The other side hung up." : "The call ended before he answered.");
        return;
      }
      if (status === "active" || status === "automation") {
        await beginTalking(room);
      }
      pollRef.current = setTimeout(() => void tick(), 1000);
    };
    pollRef.current = setTimeout(() => void tick(), 800);
  }

  async function onCall() {
    if (phase === "ringing" || phase === "talking") return;
    cancelledRef.current = false;
    talkingRef.current = false;
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

    const room = new Room({ singlePeerConnection: false });
    roomRef.current = room;
    const remoteGone = () => {
      if (roomRef.current !== room) return;
      hangup(room.name, "ended", talkingRef.current ? "The other side hung up." : "The call ended before he answered.");
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
      await room.connect(body.url, body.token);
      if (body.sessionId) {
        await fetch("/api/calls/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: body.sessionId, kind: "JOINED", message: "You joined the call." }),
        }).catch(() => undefined);
      }
      setDetail(`Ringing ${body.display}. Caller ID ${body.callerId}. It keeps ringing until he answers.`);
      watch(body.roomName, room);
    } catch (error) {
      hangup(body.roomName, "error", error instanceof Error ? error.message : "Could not join the call audio.");
    }
  }

  const busy = phase === "ringing" || phase === "talking";

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
        <Button
          type="button"
          variant="danger"
          disabled={!busy}
          onClick={() => hangup(roomNameRef.current ?? undefined, "ended", "You hung up.")}
        >
          Hang up
        </Button>
      </div>
    </section>
  );
}
