import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  SUCCESSFUL: "bg-emerald-400/15 text-emerald-300",
  VOICEMAIL: "bg-sky-400/15 text-sky-300",
  NO_ANSWER: "bg-amber-400/15 text-amber-200",
  BUSY: "bg-orange-400/15 text-orange-200",
  FAILED: "bg-rose-400/15 text-rose-300",
  IN_PROGRESS: "bg-indigo-400/15 text-indigo-200",
  CANCELLED: "bg-zinc-400/15 text-zinc-300",
  RUNNING: "bg-emerald-400/15 text-emerald-300",
  PAUSED: "bg-amber-400/15 text-amber-200",
  COMPLETED: "bg-zinc-400/15 text-zinc-200",
  DRAFT: "bg-zinc-400/10 text-zinc-300",
  QUEUED: "bg-indigo-400/15 text-indigo-200",
  DIALING: "bg-indigo-400/15 text-indigo-200",
  RINGING: "bg-violet-400/15 text-violet-200",
  ANSWERED_HUMAN: "bg-emerald-400/15 text-emerald-300",
  PLAY_HUMAN_MESSAGE: "bg-emerald-400/10 text-emerald-200",
  ANSWERING_MACHINE: "bg-sky-400/15 text-sky-300",
  PLAY_VOICEMAIL: "bg-sky-400/10 text-sky-200",
  NEW: "bg-zinc-400/10 text-zinc-300",
  IDLE: "bg-zinc-400/10 text-zinc-300",
  PENDING: "bg-zinc-400/10 text-zinc-300",
  MOCK: "bg-amber-400/20 text-amber-100",
  LIVEKIT: "bg-sky-400/15 text-sky-200",
  TALKING: "bg-emerald-400/15 text-emerald-300",
  ENDED: "bg-zinc-400/15 text-zinc-200",
  JOINED: "bg-teal-400/15 text-teal-200",
  STARTED: "bg-indigo-400/15 text-indigo-200",
  ANSWERED: "bg-emerald-400/15 text-emerald-300",
  HUNG_UP: "bg-zinc-400/15 text-zinc-300",
};

export function Badge({ value, children, className }: { value?: string | null; children?: React.ReactNode; className?: string }) {
  const key = value ?? "";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[key] ?? "bg-zinc-400/10 text-zinc-300", className)}>
      {children}
    </span>
  );
}
