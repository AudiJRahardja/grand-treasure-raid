import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MembershipNotice } from "@/components/MembershipNotice";
import { getGuildStatus } from "@/lib/membership";
import { safeNext } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Membership check" };

/** Where the login callback sends players when Discord couldn't be checked. */
export default async function VerifyPage(props: PageProps<"/verify">) {
  const params = await props.searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  // Only show known codes (never echo arbitrary text from the URL)
  const reason =
    typeof params.reason === "string" && /^[a-z-]{1,40}$/.test(params.reason) ? params.reason : undefined;

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims.sub) redirect(`/login?next=${encodeURIComponent(next)}`);

  // Already verified (e.g. this page was bookmarked)? Carry on.
  const status = await getGuildStatus(supabase);
  if (status.ok && status.status === "member") redirect(next);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-6">
      <h1 className="font-display text-4xl text-gold">Membership check</h1>
      <MembershipNotice variant="check_failed" next={next} reason={reason} />
    </div>
  );
}
