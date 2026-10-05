"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useServerNow } from "@/lib/server-clock";
import { formatDuration } from "@/lib/time";

/** Live countdown to `to` (server clock). Refreshes the page once when it hits zero. */
export function Countdown({ to, refreshOnDone = false }: { to: string; refreshOnDone?: boolean }) {
  const now = useServerNow();
  const router = useRouter();
  const refreshed = useRef(false);
  const left = now === null ? null : Math.ceil((new Date(to).getTime() - now) / 1000);

  useEffect(() => {
    if (refreshOnDone && left !== null && left <= 0 && !refreshed.current) {
      refreshed.current = true;
      // Give the database a moment so opens_at <= now() holds there too
      setTimeout(() => router.refresh(), 1500);
    }
  }, [left, refreshOnDone, router]);

  if (left === null) return <span className="tabular-nums">…</span>;
  if (left <= 0) return <span>opening…</span>;
  return <span className="tabular-nums">{formatDuration(left)}</span>;
}

/** Live "time since `from`" (server clock), e.g. "4m 12s". */
export function ElapsedTimer({ from }: { from: string }) {
  const now = useServerNow();
  if (now === null) return <span className="tabular-nums">…</span>;
  return <span className="tabular-nums">{formatDuration((now - new Date(from).getTime()) / 1000)}</span>;
}
