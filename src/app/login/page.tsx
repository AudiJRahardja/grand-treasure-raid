import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DiscordLoginButton } from "@/components/DiscordLoginButton";
import { getUserId } from "@/lib/supabase/server";
import { safeNext } from "@/lib/redirect";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : null);
  const error = typeof params.error === "string" ? params.error : null;

  if (await getUserId()) redirect(next);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-10 text-center">
      <h1 className="font-display text-4xl text-gold">Board the ship</h1>
      <p className="text-muted">
        Log in with your Discord account to join the raid. We only read your Discord username.
      </p>
      {error && (
        <p role="alert" className="card border-danger/50 text-danger">
          {error}
        </p>
      )}
      <DiscordLoginButton next={next} />
    </div>
  );
}
