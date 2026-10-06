import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { membershipBlock } from "@/components/MembershipGate";
import { ErrorNotice, InfoNotice } from "@/components/Notice";
import { logQuery } from "@/lib/debug";
import { getCurrentEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { formatWIB } from "@/lib/time";
import { LeaderboardTable, type LeaderboardRow } from "./LeaderboardTable";

export const metadata: Metadata = { title: "Leaderboard" };

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub as string | undefined;
  if (!userId) redirect("/login?next=/leaderboard");

  const blocked = await membershipBlock(supabase, "/leaderboard");
  if (blocked) return <Shell>{blocked}</Shell>;

  const current = await getCurrentEvent(supabase);
  if (!current.ok) {
    return (
      <Shell>
        <ErrorNotice title="Couldn't load the event">{current.error}</ErrorNotice>
      </Shell>
    );
  }
  const { event, status } = current;
  if (!event) {
    return (
      <Shell>
        <InfoNotice title="No event yet">The leaderboard opens when the first raid begins.</InfoNotice>
      </Shell>
    );
  }

  const boardRes = await supabase
    .from("leaderboard")
    .select("user_id, display_name, solved_count, total_points, total_seconds, rank")
    .eq("event_id", event.id)
    .order("rank", { ascending: true })
    .order("display_name", { ascending: true })
    .limit(500);
  logQuery(`leaderboard where event_id=${event.id}`, boardRes);

  const subtitle =
    status === "ended" ? `${event.name} · Final standings` : `${event.name} · Ends ${formatWIB(event.ends_at)}`;

  if (boardRes.error) {
    return (
      <Shell subtitle={subtitle}>
        <ErrorNotice title="Couldn't load the leaderboard">{boardRes.error.message}</ErrorNotice>
      </Shell>
    );
  }

  const rows = (boardRes.data ?? []) as LeaderboardRow[];
  if (rows.length === 0) {
    return (
      <Shell subtitle={subtitle}>
        <InfoNotice title="No one has solved a checkpoint yet">Be the first name on the board!</InfoNotice>
      </Shell>
    );
  }

  const onBoard = rows.some((r) => r.user_id === userId);

  return (
    <Shell subtitle={subtitle}>
      {!onBoard && <p className="text-sm text-muted">Solve a checkpoint to get your name on the board.</p>}

      <LeaderboardTable rows={rows} userId={userId} />

      <p className="text-xs text-muted">
        Ranked by points, then lowest total solve time, then whoever finished first.
      </p>
    </Shell>
  );
}

function Shell({ subtitle, children }: { subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-4xl text-gold">Leaderboard</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </header>
      {children}
    </div>
  );
}
