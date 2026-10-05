"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

let offsetPromise: Promise<number> | null = null;

/**
 * Milliseconds to add to Date.now() to get the database's clock.
 * Asks server_now() once per page load; client clocks are display-only.
 */
export function getServerOffset(): Promise<number> {
  offsetPromise ??= (async () => {
    const supabase = createClient();
    const sentAt = Date.now();
    const { data, error } = await supabase.rpc("server_now");
    const receivedAt = Date.now();
    if (error || typeof data !== "string") {
      offsetPromise = null; // try again next time
      return 0;
    }
    // Assume the server read its clock halfway through the round trip
    return new Date(data).getTime() + (receivedAt - sentAt) / 2 - receivedAt;
  })();
  return offsetPromise;
}

/**
 * The database's current time in ms, ticking every second.
 * null until the offset is known (and during server rendering).
 */
export function useServerNow(tickMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let offset: number | null = null;
    let alive = true;
    const tick = () => {
      if (alive && offset !== null) setNow(Date.now() + offset);
    };
    getServerOffset().then((o) => {
      offset = o;
      tick();
    });
    const id = setInterval(tick, tickMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tickMs]);

  return now;
}
