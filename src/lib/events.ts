import type { SupabaseClient } from "@supabase/supabase-js";
import { logQuery } from "./debug";

export type EventRow = { id: number; name: string; starts_at: string; ends_at: string };
export type EventStatus = "running" | "upcoming" | "ended";

type Result =
  | { ok: true; event: EventRow; status: EventStatus; serverNow: string }
  | { ok: true; event: null; status: null; serverNow: string }
  | { ok: false; error: string };

/**
 * The current event: the one whose window contains the database's now(),
 * otherwise the next one to start, otherwise the most recently ended one.
 */
export async function getCurrentEvent(supabase: SupabaseClient): Promise<Result> {
  const nowRes = await supabase.rpc("server_now");
  logQuery("rpc server_now()", nowRes);
  if (nowRes.error) return { ok: false, error: `Could not read server time: ${nowRes.error.message}` };
  const serverNow = nowRes.data as string;
  const now = new Date(serverNow).getTime();

  const eventsRes = await supabase
    .from("events")
    .select("id, name, starts_at, ends_at")
    .order("starts_at", { ascending: true });
  logQuery("events (id, name, starts_at, ends_at)", eventsRes);
  if (eventsRes.error) return { ok: false, error: `Could not load events: ${eventsRes.error.message}` };

  const events = (eventsRes.data ?? []) as EventRow[];
  const t = (iso: string) => new Date(iso).getTime();

  const running = events.find((e) => t(e.starts_at) <= now && now <= t(e.ends_at));
  if (running) return { ok: true, event: running, status: "running", serverNow };

  const upcoming = events.find((e) => t(e.starts_at) > now);
  if (upcoming) return { ok: true, event: upcoming, status: "upcoming", serverNow };

  const ended = events.at(-1);
  if (ended) return { ok: true, event: ended, status: "ended", serverNow };
  return { ok: true, event: null, status: null, serverNow };
}
