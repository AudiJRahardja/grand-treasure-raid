import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { verifyGuildMembership } from "@/lib/discord";
import { getGuildStatus } from "@/lib/membership";
import { safeNext } from "@/lib/redirect";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Discord -> Supabase -> here.
 * 1. Exchange the one-time code. This response is the only place Discord's
 *    access token (provider_token) ever appears.
 * 2. Save the login WITHOUT that token: the exchange uses a client whose cookie
 *    writes are held back, and the session is saved with setSession(), which
 *    keeps only Supabase's own access and refresh tokens.
 * 3. Ask Discord whether the player is in the BGDC server and record the answer.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  const loginFailed = (reason: string) => {
    const url = new URL("/login", origin);
    url.searchParams.set("error", reason);
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };
  if (!code) return loginFailed(searchParams.get("error_description") ?? "Login failed. Please try again.");

  // 1. Exchange with cookie writes held back (they would contain provider_token)
  const held: { name: string; value: string; options: Parameters<Awaited<ReturnType<typeof cookies>>["set"]>[2] }[] = [];
  const exchanger = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        held.push(...cookiesToSet);
      },
    },
  });
  const { data, error } = await exchanger.auth.exchangeCodeForSession(code);
  if (error || !data.session) return loginFailed("Login failed. Please try again.");
  const { session, user } = data;

  // 2. Save the session without provider_token / provider_refresh_token
  const supabase = await createClient();
  const saved = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (saved.error) return loginFailed("Login failed. Please try again.");
  const cookieStore = await cookies();
  // Apply only the removal of the used-up PKCE code verifier from the held writes
  for (const c of held) {
    if (c.name.endsWith("-code-verifier")) cookieStore.set(c.name, c.value, c.options);
  }
  if (process.env.NODE_ENV === "development") reportProviderTokenInCookies(cookieStore.getAll());

  // 3. BGDC membership. A failed check never counts as "not a member".
  const check = await verifyGuildMembership(session.provider_token, user);
  if (!check.ok) {
    // An earlier check that's still valid (under 21 days) is good enough to keep playing
    const current = await getGuildStatus(supabase);
    if (!(current.ok && current.status === "member")) {
      const url = new URL("/verify", origin);
      url.searchParams.set("next", next);
      url.searchParams.set("reason", check.reason);
      return NextResponse.redirect(url);
    }
  }
  // Members continue; non-members land on the same page, which explains how to join
  return NextResponse.redirect(new URL(next, origin));
}

/** Dev only: confirm the saved session cookie doesn't contain Discord's token. */
function reportProviderTokenInCookies(all: { name: string; value: string }[]) {
  const chunks = all
    .filter((c) => c.name.includes("-auth-token") && !c.name.endsWith("-code-verifier"))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const raw = chunks.map((c) => c.value).join("");
  const json = raw.startsWith("base64-") ? Buffer.from(raw.slice(7), "base64url").toString("utf8") : raw;
  console.log(
    `[auth] session cookie saved (${chunks.length} chunk${chunks.length === 1 ? "" : "s"}); ` +
      `contains provider_token: ${json.includes("provider_token") ? "YES" : "no"}`,
  );
}
