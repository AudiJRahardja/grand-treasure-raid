import type { SupabaseClient } from "@supabase/supabase-js";
import { logQuery } from "./debug";

export type GuildStatus = "member" | "not_member" | "expired" | "missing";

/**
 * The current player's BGDC membership, as the database sees it (a check is
 * valid for 21 days). The database enforces this on its own; pages use it to
 * show a clear notice instead of empty lists.
 */
export async function getGuildStatus(
  supabase: SupabaseClient,
): Promise<{ ok: true; status: GuildStatus; expiresAt?: string } | { ok: false; error: string }> {
  const res = await supabase.rpc("my_guild_status");
  logQuery("rpc my_guild_status()", res);
  if (res.error) return { ok: false, error: res.error.message };
  const data = res.data as { status: GuildStatus; expires_at?: string };
  return { ok: true, status: data.status, expiresAt: data.expires_at };
}
