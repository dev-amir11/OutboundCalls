"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { tickQueueAction } from "@/app/actions/calls";

export function Poller({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter();
  const running = useRef(false);

  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (stopped || running.current) return;
      running.current = true;
      try {
        await tickQueueAction();
        if (!stopped) router.refresh();
      } finally {
        running.current = false;
      }
    };
    const timer = setInterval(tick, intervalMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [intervalMs, router]);

  return null;
}
