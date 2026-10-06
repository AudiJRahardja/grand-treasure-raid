import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { DiscordLoginButton } from "@/components/DiscordLoginButton";
import { membershipBlock } from "@/components/MembershipGate";
import { ErrorNotice } from "@/components/Notice";
import { logQuery } from "@/lib/debug";
import { getCurrentEvent } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { formatWIB } from "@/lib/time";
import type { ScheduleRow } from "@/lib/types";

const DESCRIPTION =
  "A puzzle hunt for our Discord crew. New checkpoints unlock over two weeks: riddles, sudoku, queens and crossmath. Solve them fast to climb the leaderboard and claim the treasure.";

export default async function Home() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const loggedIn = Boolean(auth?.claims.sub);

  return (
    <div className="flex flex-col items-center gap-8 py-6 text-center sm:py-10">
      <div aria-hidden="true" className="text-6xl">
        🗺️
      </div>
      {loggedIn ? <EventIntro /> : <PublicIntro />}

      <ul className="grid w-full max-w-md gap-3 text-left text-sm sm:grid-cols-3 sm:text-center">
        <Step icon="🔓" text="Checkpoints unlock on set dates" />
        <Step icon="⏱️" text="Your timer starts when you press Start" />
        <Step icon="🏆" text="Most points, fastest time wins" />
      </ul>

      <Link href="/rules" className="text-sm text-gold underline underline-offset-4">
        Read the full rules
      </Link>
    </div>
  );
}

/** Logged out: no event data (players-only in the database), just the pitch and login. */
function PublicIntro() {
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-5xl text-gold sm:text-6xl">The Grand Treasure Raid</h1>
        <p className="mx-auto max-w-md text-muted">{DESCRIPTION}</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <DiscordLoginButton />
        <p className="text-xs text-muted">Log in to see the current raid and its schedule.</p>
      </div>
    </>
  );
}

async function EventIntro() {
  const supabase = await createClient();
  const current = await getCurrentEvent(supabase);
  const blocked = await membershipBlock(supabase, "/");

  if (!current.ok) {
    return (
      <>
        <h1 className="font-display text-5xl text-gold sm:text-6xl">The Grand Treasure Raid</h1>
        <ErrorNotice title="Couldn't load the event">{current.error}</ErrorNotice>
        <GoButton />
      </>
    );
  }

  const { event, status } = current;
  let nextUnlock: ScheduleRow | undefined;
  if (event && status !== "ended") {
    const scheduleRes = await supabase.rpc("checkpoint_schedule", { p_event_id: event.id });
    logQuery(`rpc checkpoint_schedule(${event.id})`, scheduleRes);
    const now = new Date(current.serverNow).getTime();
    nextUnlock = ((scheduleRes.data ?? []) as ScheduleRow[]).find((s) => new Date(s.opens_at).getTime() > now);
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-5xl text-gold sm:text-6xl">{event?.name ?? "The Grand Treasure Raid"}</h1>
        <p className="mx-auto max-w-md text-muted">{DESCRIPTION}</p>
      </div>

      {event && (
        <div className="card w-full max-w-md">
          {status === "running" && (
            <p>
              The raid is <strong className="text-success">live</strong> until{" "}
              <strong>{formatWIB(event.ends_at)}</strong>
            </p>
          )}
          {status === "upcoming" && (
            <p>
              The raid starts <strong>{formatWIB(event.starts_at)}</strong> and ends{" "}
              <strong>{formatWIB(event.ends_at)}</strong>
            </p>
          )}
          {status === "ended" && (
            <p>
              This raid ended <strong>{formatWIB(event.ends_at)}</strong>. Check the leaderboard for the final
              standings.
            </p>
          )}
          {nextUnlock && (
            <p className="mt-2 text-sm text-muted">
              Checkpoint {nextUnlock.checkpoint_number} unlocks in{" "}
              <strong className="text-gold">
                <Countdown to={nextUnlock.opens_at} />
              </strong>
            </p>
          )}
        </div>
      )}
      {!event && <p className="text-muted">No raid is scheduled yet. Watch Discord for the next one!</p>}

      {blocked ? <div className="w-full max-w-md">{blocked}</div> : <GoButton ended={status === "ended"} />}
    </>
  );
}

function GoButton({ ended = false }: { ended?: boolean }) {
  return ended ? (
    <Link href="/leaderboard" className="btn btn-primary w-full max-w-xs">
      See the leaderboard
    </Link>
  ) : (
    <Link href="/puzzles" className="btn btn-primary w-full max-w-xs">
      Go to checkpoints
    </Link>
  );
}

function Step({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-rope bg-deck/70 p-3 sm:flex-col sm:gap-1">
      <span aria-hidden="true" className="text-2xl">
        {icon}
      </span>
      <span>{text}</span>
    </li>
  );
}
