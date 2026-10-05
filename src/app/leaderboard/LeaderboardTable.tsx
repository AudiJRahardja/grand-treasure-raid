import { formatDuration } from "@/lib/time";

export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  solved_count: number;
  total_points: number;
  total_seconds: number;
  rank: number;
};

export function LeaderboardTable({ rows, userId }: { rows: LeaderboardRow[]; userId: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-rope bg-deck/90">
      <table className="w-full text-left">
        <caption className="sr-only">Ranked by points, then lowest total time, then earliest finish</caption>
        <thead className="border-b border-rope text-xs uppercase tracking-wide text-muted">
          <tr>
            <th scope="col" className="w-px whitespace-nowrap py-3 pl-3 pr-1 text-center sm:pl-4">#</th>
            <th scope="col" className="w-full px-2 py-3">Player</th>
            <th scope="col" className="hidden w-px whitespace-nowrap px-2 py-3 text-right sm:table-cell">Solved</th>
            <th scope="col" className="w-px whitespace-nowrap px-2 py-3 text-right">Points</th>
            <th scope="col" className="w-px whitespace-nowrap py-3 pl-2 pr-3 text-right sm:pr-4">Time</th>
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
                <td className="min-w-10 py-3 pl-3 pr-1 text-center align-top sm:pl-4">
                  <RankBadge rank={r.rank} />
                </td>
                {/* max-w-0 + w-full header: this column takes the leftover width, never grows the table */}
                <td className="max-w-0 px-2 py-3">
                  <span className={`block font-semibold leading-snug wrap-anywhere ${me ? "text-gold" : ""}`}>
                    {r.display_name}
                  </span>
                  <span className={`${me ? "flex" : "flex sm:hidden"} mt-1 flex-wrap items-center gap-2 text-xs text-muted`}>
                    {me && (
                      <span className="shrink-0 rounded-full bg-gold px-2 py-0.5 font-semibold text-sea">You</span>
                    )}
                    <span className="sm:hidden">{r.solved_count} solved</span>
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
