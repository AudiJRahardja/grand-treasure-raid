import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ErrorNotice, InfoNotice } from "@/components/Notice";
import { logQuery } from "@/lib/debug";
import { getCurrentEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatWIB } from "@/lib/time";

export const metadata: Metadata = { title: "Leaderboard" };

type LeaderboardRow = {
  user_id: string;
  display_name: string;
  solved_count: number;
  total_points: number;
  total_seconds: number;
  rank: number;
};

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub as string | undefined;
  if (!userId) redirect("/login?next=/leaderboard");

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

      <div className="overflow-hidden rounded-2xl border border-rope bg-deck/90">
        <table className="w-full text-left">
          <caption className="sr-only">
            Ranked by points, then lowest total time, then earliest finish
          </caption>
          <thead className="border-b border-rope text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="w-12 py-3 pl-3 pr-1 text-center sm:pl-4">#</th>
              <th scope="col" className="px-2 py-3">Player</th>
              <th scope="col" className="hidden px-2 py-3 text-right sm:table-cell">Solved</th>
              <th scope="col" className="px-2 py-3 text-right">Points</th>
              <th scope="col" className="py-3 pl-2 pr-3 text-right sm:pr-4">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const me = r.user_id === userId;
              return (
                <tr
                  key={r.user_id}
                  aria-current={me ? "true" : undefined}
                  className={`border-b border-rope/50 last:border-0 ${me ? "bg-gold/15" : ""}`}
                >
                  <td className="py-3 pl-3 pr-1 text-center sm:pl-4">
                    <RankBadge rank={r.rank} />
                  </td>
                  <td className="max-w-0 px-2 py-3">
                    <span className={`block truncate font-semibold ${me ? "text-gold" : ""}`}>
                      {r.display_name}
                      {me && <span className="ml-2 rounded-full bg-gold px-2 py-0.5 text-xs text-sea">You</span>}
                    </span>
                    <span className="block text-xs text-muted sm:hidden">
                      {r.solved_count} solved
                    </span>
                  </td>
                  <td className="hidden px-2 py-3 text-right tabular-nums sm:table-cell">{r.solved_count}</td>
                  <td className="px-2 py-3 text-right font-semibold tabular-nums">{r.total_points}</td>
                  <td className="whitespace-nowrap py-3 pl-2 pr-3 text-right font-mono text-sm tabular-nums sm:pr-4">
                    {formatDuration(r.total_seconds)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function RankBadge({ rank }: { rank: number }) {
  const medal = MEDALS[rank];
  if (!medal) return <span className="font-semibold tabular-nums text-muted">{rank}</span>;
  return (
    <span className="text-xl" role="img" aria-label={`Rank ${rank}`}>
      {medal}
    </span>
  );
}
