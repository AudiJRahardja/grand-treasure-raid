import Link from "next/link";
import { CompassMark } from "@/components/CompassMark";
import { NavLinks } from "@/components/NavLinks";
import { createClient } from "@/lib/supabase/server";

export async function SiteHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub as string | undefined;

  let displayName: string | null = null;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    displayName = profile?.display_name ?? "Player";
  }

  return (
    <header className="z-40 border-b border-rope/70 bg-sea/85 backdrop-blur-md sm:sticky sm:top-0">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-2 px-4 py-2">
        <Link
          href="/"
          className="group mr-auto flex min-h-11 items-center gap-2 font-display text-xl text-gold sm:text-2xl"
        >
          <CompassMark className="h-7 w-7 transition-[rotate] duration-300 ease-out group-hover:rotate-45 motion-reduce:transition-none" />
          Treasure Raid
        </Link>
        <NavLinks />
        {displayName ? (
          <form action="/auth/signout" method="post" className="flex items-center gap-2">
            <span className="max-w-32 truncate text-sm text-parchment" title={displayName}>
              {displayName}
            </span>
            <button type="submit" className="nav-link">Log out</button>
          </form>
        ) : (
          <Link href="/login" className="nav-link text-gold!">Log in</Link>
        )}
      </div>
    </header>
  );
}
