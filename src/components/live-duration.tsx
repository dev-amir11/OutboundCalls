"use client";

import { useEffect, useState } from "react";
import { elapsedSeconds, formatDuration } from "@/lib/format";

export function LiveDuration({ startedAt, endedAt }: { startedAt: string | null; endedAt?: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    if (endedAt) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [endedAt]);

  return <span className="tabular-nums">{now == null ? "—" : formatDuration(elapsedSeconds(startedAt, endedAt, new Date(now)))}</span>;
}
