import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";

const API = "https://discord.com/api/v10";
const TIMEOUT_MS = 6000;

/** Why a check couldn't be completed. Shown as a short code on /verify. */
export type CheckFailure =
  | "not-configured" // DISCORD_GUILD_ID or SUPABASE_SECRET_KEY missing
  | "no-token" // Supabase didn't pass Discord's token through
  | "no-discord-identity" // the user has no linked Discord account
  | "account-mismatch" // the token belongs to a different Discord account
  | "discord-unavailable" // Discord error, rate limit or timeout
  | "record-failed"; // the database refused or couldn't be reached

export type CheckOutcome = { ok: true; isMember: boolean } | { ok: false; reason: CheckFailure };

async function discordGet(path: string, token: string) {
  return fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
}

/**
 * Asks Discord whether the logged-in player is in the BGDC server, then records
 * the answer for THIS session's user only. Any failure is reported as a
 * failure, never as "not a member".
 */
export async function verifyGuildMembership(providerToken: string | null | undefined, user: User): Promise<CheckOutcome> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const admin = createAdminClient();
  if (!guildId || !/^\d{17,20}$/.test(guildId) || !admin) return { ok: false, reason: "not-configured" };
  if (!providerToken) return { ok: false, reason: "no-token" };

  // The Discord account linked to this Supabase user (from Supabase Auth, not user-editable metadata)
  const expectedId = user.identities?.find((i) => i.provider === "discord")?.id;
  if (!expectedId) return { ok: false, reason: "no-discord-identity" };

  let isMember: boolean;
  try {
    const me = await discordGet("/users/@me", providerToken);
    if (!me.ok) return { ok: false, reason: "discord-unavailable" };
    const { id } = (await me.json()) as { id?: string };
    if (id !== expectedId) return { ok: false, reason: "account-mismatch" };

    const member = await discordGet(`/users/@me/guilds/${guildId}/member`, providerToken);
    if (member.ok) isMember = true;
    else if (member.status === 404) isMember = false; // Discord's answer for "not in this server"
    else return { ok: false, reason: "discord-unavailable" }; // 401/403/429/5xx: we don't know
  } catch {
    return { ok: false, reason: "discord-unavailable" }; // network error or timeout
  }

  // The database double-checks that expectedId is this user's linked Discord account
  const { error } = await admin.rpc("record_guild_check", {
    p_user_id: user.id,
    p_discord_id: expectedId,
    p_is_member: isMember,
  });
  if (error) return { ok: false, reason: "record-failed" };
  return { ok: true, isMember };
}
