import { DiscordLoginButton } from "@/components/DiscordLoginButton";
import type { GuildStatus } from "@/lib/membership";

const INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL;

type Variant = Exclude<GuildStatus, "member"> | "check_failed";

/**
 * What a player sees instead of puzzles or the leaderboard when they aren't a
 * verified BGDC member. "Log in again" buttons bring them back to `next`.
 */
export function MembershipNotice({ variant, next, reason }: { variant: Variant; next: string; reason?: string }) {
  if (variant === "not_member") {
    return (
      <Box icon="🏴‍☠️" title="Join the BGDC Discord to play">
        <p>
          The Grand Treasure Raid is for members of the <strong>BGDC Discord server</strong>, and Discord says this
          account isn&apos;t in it yet. Join the server, then check again.
        </p>
        {INVITE_URL ? (
          <a href={INVITE_URL} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full sm:w-auto">
            Join the BGDC server
          </a>
        ) : (
          <p className="text-sm text-muted">Ask an organizer for an invite link.</p>
        )}
        <DiscordLoginButton next={next} label="I've joined – check again" />
      </Box>
    );
  }

  if (variant === "check_failed") {
    return (
      <Box icon="🌊" title="Couldn't check, try again">
        <p>
          We couldn&apos;t confirm your BGDC server membership with Discord just now. This isn&apos;t a problem with
          your account. Discord may be busy or slow. Please try again.
        </p>
        <DiscordLoginButton next={next} label="Try again" />
        {reason && <p className="text-xs text-muted">Code: {reason}</p>}
      </Box>
    );
  }

  // expired or missing
  return (
    <Box icon="🔑" title="Log in again to re-verify">
      <p>
        We check that you&apos;re in the BGDC Discord server each time you log in, and a check lasts 21 days.
        {variant === "expired" ? " Yours has run out." : " We don't have one for you yet."} Log in again and
        you&apos;ll come straight back to this page.
      </p>
      <DiscordLoginButton next={next} label="Log in again" />
    </Box>
  );
}

function Box({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section role="status" className="card flex flex-col items-center gap-4 text-center">
      <div aria-hidden="true" className="text-5xl">
        {icon}
      </div>
      <h2 className="font-display text-3xl text-gold">{title}</h2>
      <div className="flex w-full flex-col items-center gap-4 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
