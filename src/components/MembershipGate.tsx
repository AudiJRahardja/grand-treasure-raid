import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorNotice } from "@/components/Notice";
import { MembershipNotice } from "@/components/MembershipNotice";
import { getGuildStatus } from "@/lib/membership";

/**
 * Returns null for verified BGDC members (render the page as normal), or the
 * notice to show instead. The database enforces membership itself; this just
 * explains it instead of showing empty lists.
 */
export async function membershipBlock(supabase: SupabaseClient, next: string) {
  const g = await getGuildStatus(supabase);
  if (!g.ok) return <ErrorNotice title="Couldn't check your membership">{g.error}</ErrorNotice>;
  if (g.status === "member") return null;
  return <MembershipNotice variant={g.status} next={next} />;
}
