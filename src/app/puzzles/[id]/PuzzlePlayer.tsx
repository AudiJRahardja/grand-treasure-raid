"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Countdown, ElapsedTimer } from "@/components/Countdown";
import { ErrorNotice } from "@/components/Notice";
import { GAMES } from "@/games/registry";
import { getServerOffset, useServerNow } from "@/lib/server-clock";
import { createClient } from "@/lib/supabase/client";
import { formatDuration, formatWIB } from "@/lib/time";
import type { SubmitMessage } from "@/games/types";
import type { StartedPuzzle, SubmitResult } from "@/lib/types";

/** Another checkpoint of this event the player hasn't solved yet. */
export type Remaining = { checkpoint: number } & (
  | { state: "open"; id: number }
  | { state: "locked"; opensAt: string }
);

type Props = {
  puzzleId: number;
  started: boolean;
  solvedSeconds: number | null;
  /** End of the current wrong-answer cooldown (ISO, server time), if any */
  cooldownUntil: string | null;
  /** Unsolved checkpoints other than this one, in order */
  remaining: Remaining[];
  /** False if locked checkpoints couldn't be listed (schedule function missing) */
  scheduleKnown: boolean;
};

type Phase =
  | { name: "intro" }
  | { name: "starting" }
  | { name: "playing"; puzzle: StartedPuzzle }
  | { name: "solved"; seconds: number; justNow: boolean }
  | { name: "error"; message: string };

/** Turn RPC exceptions from start_puzzle / submit_answer into player-friendly text. */
function friendlyError(message: string) {
  if (/not logged in/i.test(message)) return "Your session expired. Please log in again.";
  if (/not available/i.test(message))
    return "This checkpoint isn't available. It may not be open yet, or the raid has ended.";
  if (/start the puzzle first/i.test(message)) return "Press Start before submitting.";
  return message;
}

async function startPuzzle(puzzleId: number): Promise<Phase> {
  const { data, error } = await createClient().rpc("start_puzzle", { p_puzzle_id: puzzleId });
  if (error) return { name: "error", message: friendlyError(error.message) };
  return { name: "playing", puzzle: data as StartedPuzzle };
}

export function PuzzlePlayer({ puzzleId, started, solvedSeconds, cooldownUntil, remaining, scheduleKnown }: Props) {
  const [phase, setPhase] = useState<Phase>(() =>
    solvedSeconds !== null
      ? { name: "solved", seconds: solvedSeconds, justNow: false }
      : started
        ? { name: "starting" }
        : { name: "intro" },
  );
  const [feedback, setFeedback] = useState<SubmitMessage | null>(null);
  const [pending, setPending] = useState(false);
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(
    cooldownUntil ? new Date(cooldownUntil).getTime() : null,
  );
  const now = useServerNow();
  const cooldownLeft = now !== null && cooldownEnd !== null ? Math.max(0, Math.ceil((cooldownEnd - now) / 1000)) : 0;

  // Already started earlier: fetch the content again (the timer keeps its original start)
  useEffect(() => {
    if (!started || solvedSeconds !== null) return;
    let cancelled = false;
    startPuzzle(puzzleId).then((p) => {
      if (!cancelled) setPhase(p);
    });
    return () => {
      cancelled = true;
    };
  }, [puzzleId, started, solvedSeconds]);

  async function handleStart() {
    setPhase({ name: "starting" });
    setPhase(await startPuzzle(puzzleId));
  }

  async function handleSubmit(answer: unknown) {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    const { data, error } = await createClient().rpc("submit_answer", {
      p_puzzle_id: puzzleId,
      p_answer: answer,
    });
    setPending(false);

    if (error) {
      setFeedback({ tone: "error", text: friendlyError(error.message) });
      return;
    }
    const result = data as SubmitResult;
    const coolFor = async (seconds: number) =>
      setCooldownEnd(Date.now() + (await getServerOffset()) + seconds * 1000);

    if ("already_solved" in result) {
      setFeedback({ tone: "error", text: "You've already solved this checkpoint. Reload to see your time." });
    } else if (!result.ok) {
      await coolFor(result.retry_in_seconds);
      setFeedback({
        tone: "cooldown",
        text: "Easy there, captain! Only one wrong answer per minute, across all checkpoints.",
      });
    } else if (result.correct) {
      setPhase({ name: "solved", seconds: result.solve_seconds, justNow: true });
    } else {
      await coolFor(result.retry_in_seconds);
      setFeedback({ tone: "wrong", text: "Not quite. Check your answer and try again when the cooldown ends." });
    }
  }

  if (phase.name === "intro") {
    return (
      <div className="card flex flex-col gap-4 text-center">
        <p className="text-lg">Ready, captain?</p>
        <p className="text-sm text-muted">
          Your timer starts the moment you press <strong className="text-parchment">Start puzzle</strong>, and it
          keeps running even if you leave or reload the page. Faster solves rank higher.
        </p>
        <button type="button" onClick={handleStart} className="btn btn-primary self-center px-10">
          Start puzzle
        </button>
      </div>
    );
  }

  if (phase.name === "starting") {
    return (
      <div className="card text-center text-muted" role="status">
        Unrolling the map…
      </div>
    );
  }

  if (phase.name === "error") {
    return (
      <div className="flex flex-col gap-4">
        <ErrorNotice title="Can't open this checkpoint">{phase.message}</ErrorNotice>
        <Link href="/puzzles" className="btn btn-secondary self-start">
          Back to checkpoints
        </Link>
      </div>
    );
  }

  if (phase.name === "solved") {
    return <Solved seconds={phase.seconds} justNow={phase.justNow} remaining={remaining} scheduleKnown={scheduleKnown} />;
  }

  const game = GAMES[phase.puzzle.type];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl border border-rope bg-deck-raised px-4 py-2">
        <span className="text-sm text-muted">Your time</span>
        <span className="font-mono text-xl text-gold" aria-live="off">
          <ElapsedTimer from={phase.puzzle.opened_at} />
        </span>
      </div>

      {!game ? (
        <ErrorNotice title="Unsupported puzzle">
          This site can&apos;t display &ldquo;{phase.puzzle.type}&rdquo; puzzles yet. Tell the organizer.
        </ErrorNotice>
      ) : !game.isData(phase.puzzle.data) ? (
        <ErrorNotice title="Puzzle data problem">
          This checkpoint&apos;s data doesn&apos;t match the {phase.puzzle.type} format. Tell the organizer.
        </ErrorNotice>
      ) : (
        <game.Component
          puzzleId={puzzleId}
          data={phase.puzzle.data}
          onSubmit={handleSubmit}
          submit={{ pending, cooldownLeft, message: feedback }}
        />
      )}
    </div>
  );
}

function Solved({
  seconds,
  justNow,
  remaining,
  scheduleKnown,
}: {
  seconds: number;
  justNow: boolean;
  remaining: Remaining[];
  scheduleKnown: boolean;
}) {
  const nextOpen = remaining.find((r) => r.state === "open");

  return (
    <div className="card flex flex-col items-center gap-4 border-gold/60 pt-8 text-center sm:pt-10">
      {/* Room above for the bounce so the icon never touches the card edge */}
      <div aria-hidden="true" className={`text-6xl leading-none ${justNow ? "animate-bounce" : ""}`}>
        💰
      </div>
      <h2 className="font-display text-4xl text-gold">{justNow ? "Treasure found!" : "Already solved"}</h2>
      <p className="text-lg">
        Solved in <strong className="font-mono text-gold">{formatDuration(seconds)}</strong>
      </p>

      <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        {nextOpen?.state === "open" && (
          <Link href={`/puzzles/${nextOpen.id}`} className="btn btn-primary">
            Next: Checkpoint {nextOpen.checkpoint} →
          </Link>
        )}
        <Link href="/leaderboard" className="btn btn-secondary">
          Leaderboard
        </Link>
        <Link href="/puzzles" className="btn btn-secondary">
          All checkpoints
        </Link>
      </div>

      {remaining.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-muted">
          {remaining.map((r) => (
            <li key={r.checkpoint}>
              {r.state === "open" ? (
                <Link href={`/puzzles/${r.id}`} className="underline underline-offset-4 hover:text-parchment">
                  Checkpoint {r.checkpoint} is still waiting for you
                </Link>
              ) : (
                <>
                  Checkpoint {r.checkpoint} opens {formatWIB(r.opensAt)} (in <Countdown to={r.opensAt} />)
                </>
              )}
            </li>
          ))}
        </ul>
      ) : scheduleKnown ? (
        <p className="text-sm text-muted">That was the last checkpoint. Well sailed!</p>
      ) : (
        <p className="text-sm text-muted">No other checkpoints are open right now. Check the list for new ones.</p>
      )}
    </div>
  );
}
