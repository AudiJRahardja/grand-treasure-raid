# Security review

**Date:** 2026-10-06
**Scope:** the app code in `src/`, the scripts, and `supabase/schema.sql` plus
`migrations/001`.
**Changes:** none to the database. This review lists findings; the database rules are as
designed.

## How it was checked

- **Code:** searched for keys, queries and how data is rendered.
- **Logged-out routes:** requested every protected page without a session.
- **Database:** ran the real `schema.sql`, the migration and the test data in a local Postgres
  engine (PGlite), with Supabase's `auth.uid()`, `anon` and `authenticated` roles stood in. It
  then acted as a logged-in player and as a logged-out visitor.

## Confirmed

| Check | Result |
|---|---|
| Service-role or secret key used anywhere | **No.** The app reads only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (plus `NODE_ENV`). `.env.local` isn't tracked by git. |
| `select("*")` on `puzzles` (or anywhere) | **No.** Every query names its columns. Puzzle queries use only `id, event_id, checkpoint_number, type, title, opens_at, points`. In the database, `select *` and `select data` on `puzzles` are refused for players. |
| Solutions exposed | **No.** App code never references `puzzle_solutions`. As a player, reading it (directly or through a join) is refused. Answers are checked only inside `submit_answer`. |
| Other players' answers or progress exposed | **No.** The only `submissions` query reads your own last wrong attempt's time. As a player, other players' `progress` and `submissions` rows are invisible, and direct writes to either table are refused. |
| Leaderboard contents | Only display name, solved count, points, total time, last solve time, rank, and the player's user id (see finding 1). |
| Locked puzzles | Invisible to players until `opens_at`, and `start_puzzle` refuses them. `checkpoint_schedule` returns only numbers and times. |
| Logged-out visitors | `/puzzles`, `/puzzles/1`, `/puzzles/999`, `/puzzles/abc`, `/leaderboard` and `/leaderboard?x=1` all redirect (307) to `/login?next=…`. In the database, `anon` is refused for events, leaderboard, profiles, `server_now`, `checkpoint_schedule` and `start_puzzle`. |
| Login redirect | `next=//evil.example`, `next=https://evil.example` and `next=/\evil.example` all fall back to `/puzzles`. Same-site paths are kept. |
| Renaming other players | Refused (0 rows changed). |
| Rendering player text | No `dangerouslySetInnerHTML` or `eval`. React escapes display names. |
| Production logging | Query logging runs only when `NODE_ENV` is `development`. The production build contains no log code. |
| Error details | The error page shows only Next's error code (digest) in production, not the message. |

## Findings and recommendations

Nothing here lets a player see solutions or another player's answers. These are hardening
suggestions; each needs a database change, so none has been made.

1. **The leaderboard view shares each listed player's user id (a UUID)** with every
   logged-in player. The site uses it to highlight your own row. UUIDs aren't credentials,
   so the risk is low.
   *Option:* replace `user_id` in the view with `(pr.user_id = auth.uid()) as is_me`.
2. **Display names have no length or content limit.** Players can rename themselves through
   the API (`grant update (display_name)`), even though the site has no rename screen, and the
   name shows on the leaderboard. A very long or offensive name is possible. The leaderboard
   wraps long names safely.
   *Option:* a check constraint such as
   `char_length(btrim(display_name)) between 1 and 32`.
3. **`submit_answer` stores any answer JSON, whatever its size,** in `submissions`. The
   one-minute cooldown limits the rate of wrong attempts, but not their size.
   *Option:* at the top of `submit_answer`, reject answers over a few KB
   (`if pg_column_size(p_answer) > 8192 then raise exception 'Answer too large'; end if;`).
4. **No Discord server membership check yet** (a stretch goal). Anyone with a Discord
   account can log in, play and appear on the leaderboard.
5. **One person can play with several Discord accounts.** This can't be prevented
   technically. Watch `submissions` for suspicious patterns.
6. **Expected warning:** Supabase's database linter will warn that `leaderboard` is a
   "security definer view". That's intentional, so the view can show names and totals
   without opening the underlying tables.
7. **Don't commit real puzzles before the event if the repository is public.** The test
   SQL files and `scripts/examples/` contain answers; that's fine for test data. Keep real
   puzzle JSON and solutions in the git-ignored `private/` folder, or paste them straight into
   the SQL Editor.
8. **No custom security headers** (e.g. `X-Frame-Options`, `Content-Security-Policy`). This
   is low risk for this site.
   *Option:* add `headers()` to `next.config.ts`. That's an app change, not a database one.
