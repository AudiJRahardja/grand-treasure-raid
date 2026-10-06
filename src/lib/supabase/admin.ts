import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * Server-only Supabase client using the SECRET key (sb_secret_… or the legacy
 * service_role key). Used for exactly one thing: recording a player's Discord
 * membership check via record_guild_check(). Never import this from a Client
 * Component; "server-only" makes the build fail if anyone tries.
 * Returns null if SUPABASE_SECRET_KEY isn't set.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
