import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorNotice, InfoNotice } from "@/components/Notice";
import { logQuery } from "@/lib/debug";
import { getCurrentEvent, type EventStatus } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatWIB } from "@/lib/time";

export const metadata: Metadata = { title: "Puzzles" };

// Explicit columns only: players are not granted the `data` column.
const PUZZLE_COLUMNS = "id, event_id, checkpoint_number, type, title, opens_at, points";

type PuzzleRow = {
  id: number;
  event_id: number;
  checkpoint_number: number;
  type: string;
  title: string;
  opens_at: string;
  points: number;
};
type ProgressRow = { puzzle_id: number; opened_at: string; solved_at: string | null; solve_seconds: number | null };

export default async function PuzzlesPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub as string | undefined;
  if (!userId) redirect("/login?next=/puzzles");

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
        <InfoNotice title="No event yet">
          The next treasure raid hasn&apos;t been announced. Check Discord for news.
        </InfoNotice>
      </Shell>
    );
  }

  // RLS only returns puzzles whose opens_at has passed
  const puzzlesRes = await supabase
    .from("puzzles")
    .select(PUZZLE_COLUMNS)
    .eq("event_id", event.id)
    .order("checkpoint_number", { ascending: true });
  logQuery(`puzzles (${PUZZLE_COLUMNS}) where event_id=${event.id}`, puzzlesRes);

  const progressRes = await supabase
    .from("progress")
    .select("puzzle_id, opened_at, solved_at, solve_seconds")
    .eq("user_id", userId);
  logQuery("progress (own rows)", progressRes);

  const error = puzzlesRes.error ?? progressRes.error;
  if (error) {
    return (
      <Shell eventName={event.name}>
        <ErrorNotice title="Couldn't load checkpoints">{error.message}</ErrorNotice>
      </Shell>
    );
  }

  const puzzles = (puzzlesRes.data ?? []) as PuzzleRow[];
  const progress = new Map(((progressRes.data ?? []) as ProgressRow[]).map((p) => [p.puzzle_id, p]));

  return (
    <Shell eventName={event.name}>
      <EventStatusLine status={status} startsAt={event.starts_at} endsAt={event.ends_at} />

      {puzzles.length === 0 ? (
        <InfoNotice title="No checkpoints open yet">
          {status === "upcoming"
            ? `The raid starts ${formatWIB(event.starts_at)}.`
            : "The first checkpoint hasn't unlocked yet. Check back soon."}
        </InfoNotice>
      ) : (
        <ol className="flex flex-col gap-3">
          {puzzles.map((p) => (
            <li key={p.id}>
              <PuzzleCard puzzle={p} progress={progress.get(p.id)} ended={status === "ended"} />
            </li>
          ))}
        </ol>
      )}
    </Shell>
  );
}

function Shell({ eventName, children }: { eventName?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="font-display text-4xl text-gold">Checkpoints</h1>
        {eventName && <p className="mt-1 text-muted">{eventName}</p>}
      </header>
      {children}
    </div>
  );
}

function EventStatusLine({ status, startsAt, endsAt }: { status: EventStatus; startsAt: string; endsAt: string }) {
  const text =
    status === "running"
      ? `Raid ends ${formatWIB(endsAt)}`
      : status === "upcoming"
        ? `Raid starts ${formatWIB(startsAt)}`
        : `This raid ended ${formatWIB(endsAt)}`;
  return <p className="text-sm text-muted">{text}</p>;
}

function PuzzleCard({ puzzle, progress, ended }: { puzzle: PuzzleRow; progress?: ProgressRow; ended: boolean }) {
  const solved = progress?.solved_at != null;
  const started = progress != null && !solved;

  const badge = solved
    ? { text: "Solved", cls: "bg-success/15 text-success" }
    : ended
      ? { text: "Closed", cls: "bg-rope/40 text-muted" }
      : started
        ? { text: "In progress", cls: "bg-gold/15 text-gold" }
        : { text: "Available", cls: "bg-gold/15 text-gold" };

  return (
    <Link
      href={`/puzzles/${puzzle.id}`}
      className="card flex min-h-20 items-center gap-4 transition hover:border-gold/60 focus-visible:outline-2 focus-visible:outline-gold"
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold/50 font-display text-2xl text-gold"
      >
        {puzzle.checkpoint_number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs uppercase tracking-wide text-muted">
          Checkpoint {puzzle.checkpoint_number} · {puzzle.type}
        </span>
        <span className="block truncate text-lg font-semibold">{puzzle.title}</span>
        {solved && progress?.solve_seconds != null && (
          <span className="block text-sm text-success">Solved in {formatDuration(progress.solve_seconds)}</span>
        )}
      </span>
      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${badge.cls}`}>{badge.text}</span>
    </Link>
  );
}
