# Security review

**Last updated:** 2026-10-06, after migration 003 (BGDC membership).
**Scope:** the app code in `src/`, the scripts, and `supabase/schema.sql` plus migrations
001–003.

## How it was checked

- **Code:** searched for keys, queries and how data is rendered.
- **Logged-out routes:** requested every protected page without a session.
- **Database:** ran the real SQL files in a local Postgres engine (PGlite), with Supabase's
  `auth.uid()`, `auth.identities`, and the `anon`, `authenticated` and `service_role` roles
  stood in. It then acted as members, non-members, expired and never-checked players, a
  logged-out visitor, and the site's server.

## Confirmed

| Check | Result |
|---|---|
| Secret / service-role key | Used **only on the server**, in one file (`src/lib/supabase/admin.ts`, marked `import "server-only"`), only to call `record_guild_check`. The variable is `SUPABASE_SECRET_KEY`, with no `NEXT_PUBLIC_` prefix, so it is never sent to browsers. `.env.local` isn't tracked by git. |
| `select("*")` on `puzzles` (or anywhere) | **No.** Every query names its columns. In the database, `select *` and `select data` on `puzzles` are refused for players. |
| Solutions exposed | **No.** App code never references `puzzle_solutions`. As a player, reading it (directly or through a join) is refused. |
| Other players' answers or progress exposed | **No.** As a player, other players' `progress`, `submissions` and `guild_members` rows are invisible, and direct writes to any of them are refused. |
| BGDC membership enforced by the database | Non-members, expired checks (over 21 days) and never-checked players: see **no** puzzles, get an empty schedule, are refused by `start_puzzle`/`submit_answer` ("Not a verified BGDC member"), and get **0 rows** from the `leaderboard` view. |
| Faking membership | Inserting, updating or deleting a `guild_members` row (your own or another player's) is refused. Calling `record_guild_check` as a player is refused. Even with the secret key, `record_guild_check` refuses a Discord id that isn't that user's linked Discord account. |
| Whose account is checked | The server compares Discord's `/users/@me` id with the session user's linked Discord identity (from Supabase Auth, not editable `user_metadata`). It writes only for that session's user, and the database checks the pair again. |
| Discord token storage | Discord's access token is used once on the server during login and **not saved** in the login cookie. The login is saved with `setSession()` (access and refresh tokens only). In dev, the callback prints `contains provider_token: no` to confirm. |
| Discord failures | Errors, rate limits and timeouts never record "not a member". The player sees "Couldn't check, try again", or keeps playing if their last check is still valid. |
| Leaderboard | Only members are listed and ranked. A faster non-member doesn't push members down. Viewing it needs a current check. |
| Renaming | Players can no longer change `display_name` (003 revokes the permission). The SQL Editor still can. |
| Logged-out visitors | `/puzzles`, `/puzzles/[id]`, `/leaderboard` and `/verify` redirect to `/login?next=…`. In the database, `anon` is refused everywhere, including the new membership functions. |
| Login redirect | `next=//evil.example`, `next=https://evil.example` and `next=/\evil.example` fall back to `/puzzles`. Same-site paths are kept. |
| Rendering player text | No `dangerouslySetInnerHTML` or `eval`. React escapes display names. `/verify` shows only short known codes, never raw URL text. |
| Production logging | Query and `[auth]` logging run only when `NODE_ENV` is `development`. |

## Findings and recommendations

Nothing here lets a player see solutions or another player's answers, or play without being
a verified member.

1. **The leaderboard view shares each listed member's user id (a UUID)** with other
   members. The site uses it to highlight your own row. The risk is low.
   *Option:* replace `user_id` in the view with `(pr.user_id = auth.uid()) as is_me`.
2. **✅ Fixed by 002.** Display names must be 1–32 characters. Since 003, players can't
   rename themselves at all.
3. **✅ Fixed by 002.** New answers over 4000 bytes are refused.
4. **✅ Fixed by 003.** BGDC server membership is required.
   - **Limitation:** someone who leaves the server keeps access until their check expires
     (at most 21 days), or until you delete their `guild_members` row.
   - **Limitation:** the leaderboard lists players by their latest check, so they stay in
     the standings even after 21 days.
5. **A wrong `DISCORD_GUILD_ID` locks everyone out.** It doesn't let anyone in: Discord
   answers "not found" for a wrong server ID just as for "not in the server". Test with your
   own account after setting it.
6. **The project now has a secret key.** Mark it **Sensitive** on Vercel, never prefix it
   with `NEXT_PUBLIC_`, and rotate it in Supabase (API Keys) if it's ever exposed.
7. **One person can play with several Discord accounts**, as long as each is in the server.
   Watch `submissions` for suspicious patterns.
8. **Expected warning:** Supabase's linter flags `leaderboard` as a "security definer view".
   That's intentional.
9. **Don't commit real puzzles before the event if the repository is public.** Keep them in
   the git-ignored `private/` folder.
10. **No custom security headers** (e.g. `X-Frame-Options`, `Content-Security-Policy`).
    This is low risk. *Option:* add `headers()` to `next.config.ts`.
11. **The callback relies on a library detail.** It keeps Discord's token out of the cookie
    by exchanging the code with a client whose cookie writes are held back, then calling
    `setSession()`. After upgrading `@supabase/ssr` or `@supabase/supabase-js`, log in once
    in dev and confirm the `[auth] … contains provider_token: no` line.
