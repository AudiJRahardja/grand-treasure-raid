import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirect";

/** Discord -> Supabase -> here. Exchange the one-time code for a session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  const reason = searchParams.get("error_description") ?? "Login failed. Please try again.";
  const url = new URL("/login", origin);
  url.searchParams.set("error", reason);
  url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}
