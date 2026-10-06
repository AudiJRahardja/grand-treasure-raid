import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Countdown } from "@/components/Countdown";
import { membershipBlock } from "@/components/MembershipGate";
import { ErrorNotice, InfoNotice } from "@/components/Notice";
import { logQuery } from "@/lib/debug";
import { getCurrentEvent, type EventStatus } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { formatDuration, formatWIB } from "@/lib/time";
import { PUZZLE_COLUMNS, type ProgressRow, type PuzzleMeta, type ScheduleRow } from "@/lib/types";

export const metadata: Metadata = { title: "Puzzles" };

type Card =
  | { kind: "open"; checkpoint: number; puzzle: PuzzleMeta }
  | { kind: "locked"; checkpoint: number; opensAt: string };

export default async function PuzzlesPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub as string | undefined;
  if (!userId) redirect("/login?next=/puzzles");

  const blocked = await membershipBlock(supabase, "/puzzles");
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
        <InfoNotice title="No event yet">
          The next treasure raid hasn&apos;t been announced. Check Discord for news.
        </InfoNotice>
      </Shell>
    );
  }

  const [puzzlesRes, progressRes, scheduleRes] = await Promise.all([
    // RLS only returns puzzles whose opens_at has passed
    supabase
      .from("puzzles")
      .select(PUZZLE_COLUMNS)
      .eq("event_id", event.id)
      .order("checkpoint_number", { ascending: true }),
    supabase.from("progress").select("puzzle_id, opened_at, solved_at, solve_seconds").eq("user_id", userId),
    // Checkpoint numbers + unlock times only (migration 001)
    supabase.rpc("checkpoint_schedule", { p_event_id: event.id }),
  ]);
  logQuery(`puzzles (${PUZZLE_COLUMNS}) where event_id=${event.id}`, puzzlesRes);
  logQuery("progress (own rows)", progressRes);
  logQuery(`rpc checkpoint_schedule(${event.id})`, scheduleRes);

  const error = puzzlesRes.error ?? progressRes.error;
  if (error) {
    return (
      <Shell eventName={event.name}>
        <ErrorNotice title="Couldn't load checkpoints">{error.message}</ErrorNotice>
      </Shell>
    );
  }

  const puzzles = (puzzlesRes.data ?? []) as PuzzleMeta[];
  const schedule = scheduleRes.error ? [] : ((scheduleRes.data ?? []) as ScheduleRow[]);
  const progress = new Map(((progressRes.data ?? []) as ProgressRow[]).map((p) => [p.puzzle_id, p]));

  const openNumbers = new Set(puzzles.map((p) => p.checkpoint_number));
  const cards: Card[] = [
    ...puzzles.map((p): Card => ({ kind: "open", checkpoint: p.checkpoint_number, puzzle: p })),
    ...schedule
      .filter((s) => !openNumbers.has(s.checkpoint_number))
      .map((s): Card => ({ kind: "locked", checkpoint: s.checkpoint_number, opensAt: s.opens_at })),
  ].sort((a, b) => a.checkpoint - b.checkpoint);

  return (
    <Shell eventName={event.name}>
      <EventStatusLine status={status} startsAt={event.starts_at} endsAt={event.ends_at} />

      {scheduleRes.error && (
        <ErrorNotice title="Upcoming unlock times unavailable">
          {scheduleRes.error.message}. Open checkpoints still work. (Has migration 001 been run?)
        </ErrorNotice>
      )}

      {cards.length === 0 ? (
        <InfoNotice title="No checkpoints open yet">
          {status === "upcoming"
            ? `The raid starts ${formatWIB(event.starts_at)}.`
            : "The first checkpoint hasn't unlocked yet. Check back soon."}
        </InfoNotice>
      ) : (
        <ol className="flex flex-col gap-3">
          {cards.map((c) => (
            <li key={c.checkpoint}>
              {c.kind === "open" ? (
                <PuzzleCard puzzle={c.puzzle} progress={progress.get(c.puzzle.id)} ended={status === "ended"} />
              ) : (
                <LockedCard checkpoint={c.checkpoint} opensAt={c.opensAt} />
              )}
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

function CheckpointBadge({ n, locked = false }: { n: number; locked?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border font-display text-2xl ${
        locked ? "border-rope text-muted" : "border-gold/50 text-gold"
      }`}
    >
      {locked ? "🔒" : n}
    </span>
  );
}

function PuzzleCard({ puzzle, progress, ended }: { puzzle: PuzzleMeta; progress?: ProgressRow; ended: boolean }) {
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
      <CheckpointBadge n={puzzle.checkpoint_number} />
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

function LockedCard({ checkpoint, opensAt }: { checkpoint: number; opensAt: string }) {
  return (
    <div className="card flex min-h-20 items-center gap-4 opacity-80">
      <CheckpointBadge n={checkpoint} locked />
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold">Checkpoint {checkpoint}</span>
        <span className="block text-sm text-muted">Opens {formatWIB(opensAt)}</span>
      </span>
      <span className="shrink-0 rounded-full bg-rope/40 px-3 py-1 text-xs font-semibold text-muted">
        <span className="sr-only">Locked, opens in </span>
        <Countdown to={opensAt} refreshOnDone />
      </span>
    </div>
  );
}
