import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { membershipBlock } from "@/components/MembershipGate";
import { ErrorNotice, InfoNotice } from "@/components/Notice";
import { logQuery } from "@/lib/debug";
import { createClient } from "@/lib/supabase/server";
import { formatWIB } from "@/lib/time";
import { COOLDOWN_SECONDS, PUZZLE_COLUMNS, type ProgressRow, type PuzzleMeta, type ScheduleRow } from "@/lib/types";
import { PuzzlePlayer, type Remaining } from "./PuzzlePlayer";

export const metadata: Metadata = { title: "Checkpoint" };

export default async function PuzzlePage(props: PageProps<"/puzzles/[id]">) {
  const { id: idParam } = await props.params;
  if (!/^\d+$/.test(idParam)) notFound();
  const puzzleId = Number(idParam);

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims.sub as string | undefined;
  if (!userId) redirect(`/login?next=/puzzles/${puzzleId}`);

  const blocked = await membershipBlock(supabase, `/puzzles/${puzzleId}`);
  if (blocked) return <Page>{blocked}</Page>;

  // RLS hides puzzles that haven't opened yet
  const puzzleRes = await supabase.from("puzzles").select(PUZZLE_COLUMNS).eq("id", puzzleId).maybeSingle();
  logQuery(`puzzles (${PUZZLE_COLUMNS}) where id=${puzzleId}`, puzzleRes);
  if (puzzleRes.error) {
    return <Failed message={puzzleRes.error.message} />;
  }
  const puzzle = puzzleRes.data as PuzzleMeta | null;
  if (!puzzle) {
    return (
      <Page>
        <InfoNotice title="Not open yet">
          This checkpoint doesn&apos;t exist or hasn&apos;t unlocked. Check the list for unlock times.
        </InfoNotice>
        <BackLink />
      </Page>
    );
  }

  const [nowRes, eventRes, progressRes, lastWrongRes, openRes, solvedRes, scheduleRes] = await Promise.all([
    supabase.rpc("server_now"),
    supabase.from("events").select("id, name, ends_at").eq("id", puzzle.event_id).single(),
    supabase
      .from("progress")
      .select("puzzle_id, opened_at, solved_at, solve_seconds")
      .eq("user_id", userId)
      .eq("puzzle_id", puzzleId)
      .maybeSingle(),
    supabase
      .from("submissions")
      .select("submitted_at")
      .eq("user_id", userId)
      .eq("is_correct", false)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("puzzles")
      .select("id, checkpoint_number")
      .eq("event_id", puzzle.event_id)
      .order("checkpoint_number", { ascending: true }),
    supabase.from("progress").select("puzzle_id").eq("user_id", userId).not("solved_at", "is", null),
    supabase.rpc("checkpoint_schedule", { p_event_id: puzzle.event_id }),
  ]);
  logQuery("rpc server_now()", nowRes);
  logQuery(`events where id=${puzzle.event_id}`, eventRes);
  logQuery(`progress (own) where puzzle_id=${puzzleId}`, progressRes);
  logQuery("submissions (own) last wrong", lastWrongRes);
  logQuery("puzzles (id, checkpoint_number) open in event", openRes);
  logQuery("progress (own) solved puzzle ids", solvedRes);
  logQuery(`rpc checkpoint_schedule(${puzzle.event_id})`, scheduleRes);

  const error = nowRes.error ?? eventRes.error ?? progressRes.error ?? lastWrongRes.error ?? openRes.error ?? solvedRes.error;
  if (error) return <Failed message={error.message} />;

  const now = new Date(nowRes.data as string).getTime();
  const event = eventRes.data as { id: number; name: string; ends_at: string };
  const progress = progressRes.data as ProgressRow | null;
  const solved = progress?.solved_at != null;
  const ended = now > new Date(event.ends_at).getTime();

  const lastWrong = lastWrongRes.data as { submitted_at: string } | null;
  const cooldownEnd = lastWrong ? new Date(lastWrong.submitted_at).getTime() + COOLDOWN_SECONDS * 1000 : 0;
  const cooldownUntil = cooldownEnd > now ? new Date(cooldownEnd).toISOString() : null;

  const remaining = remainingCheckpoints(
    puzzle.id,
    (openRes.data ?? []) as { id: number; checkpoint_number: number }[],
    new Set(((solvedRes.data ?? []) as { puzzle_id: number }[]).map((p) => p.puzzle_id)),
    // If the schedule function is missing, locked checkpoints just aren't listed
    scheduleRes.error ? [] : ((scheduleRes.data ?? []) as ScheduleRow[]),
  );

  return (
    <Page puzzle={puzzle} eventName={event.name}>
      {ended && !solved ? (
        <>
          <InfoNotice title="This raid has ended">
            Checkpoints closed {formatWIB(event.ends_at)}. See how everyone did on the leaderboard.
          </InfoNotice>
          <Link href="/leaderboard" className="btn btn-secondary self-start">
            Leaderboard
          </Link>
        </>
      ) : (
        <PuzzlePlayer
          puzzleId={puzzle.id}
          type={puzzle.type}
          started={progress !== null}
          solvedSeconds={solved ? (progress?.solve_seconds ?? 0) : null}
          cooldownUntil={cooldownUntil}
          remaining={remaining}
          scheduleKnown={!scheduleRes.error}
        />
      )}
    </Page>
  );
}

/** Every checkpoint of the event except this one that the player hasn't solved. */
function remainingCheckpoints(
  currentId: number,
  open: { id: number; checkpoint_number: number }[],
  solvedIds: Set<number>,
  schedule: ScheduleRow[],
): Remaining[] {
  const openNumbers = new Set(open.map((p) => p.checkpoint_number));
  const result: Remaining[] = [
    ...open
      .filter((p) => p.id !== currentId && !solvedIds.has(p.id))
      .map((p): Remaining => ({ state: "open", id: p.id, checkpoint: p.checkpoint_number })),
    // In the schedule but not readable yet = still locked
    ...schedule
      .filter((s) => !openNumbers.has(s.checkpoint_number))
      .map((s): Remaining => ({ state: "locked", checkpoint: s.checkpoint_number, opensAt: s.opens_at })),
  ];
  return result.sort((a, b) => a.checkpoint - b.checkpoint);
}

function Page({ puzzle, eventName, children }: { puzzle?: PuzzleMeta; eventName?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:gap-5">
      <header>
        {puzzle && (
          <p className="text-xs uppercase tracking-wide text-muted">
            Checkpoint {puzzle.checkpoint_number}
            {eventName && ` · ${eventName}`}
          </p>
        )}
        <h1 className="font-display text-3xl text-gold sm:text-4xl">{puzzle?.title ?? "Checkpoint"}</h1>
      </header>
      {children}
    </div>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <Page>
      <ErrorNotice title="Couldn't load this checkpoint">{message}</ErrorNotice>
      <BackLink />
    </Page>
  );
}

function BackLink() {
  return (
    <Link href="/puzzles" className="btn btn-secondary self-start">
      Back to checkpoints
    </Link>
  );
}
