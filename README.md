# The Grand Treasure Raid

A website for a Discord community's recurring puzzle event. Players log in with Discord and
solve checkpoints that unlock on set dates over about two weeks. A leaderboard ranks them by
points, then total solve time. The organizer adds puzzles in the Supabase dashboard and
announces results in Discord. There's no bot and no admin screen.

**Puzzle types:** riddle, sudoku, queens and crossmath. Their formats are in
[docs/puzzle-formats.md](docs/puzzle-formats.md).

**Stack:**

- Next.js 16 (App Router), TypeScript and Tailwind CSS 4
- Supabase: Postgres plus Discord login through Supabase Auth
- Hosted on Vercel (free tier)
- Built mobile-first

## Setup, in order

You need Node.js 20.9 or newer (tested on 24), Git, and free accounts at
[supabase.com](https://supabase.com), [discord.com/developers](https://discord.com/developers/applications),
[github.com](https://github.com) and [vercel.com](https://vercel.com).

### 1. Create the Supabase project

On supabase.com, click **New project**.

| Field | What to choose |
|---|---|
| Organization | yours |
| Project name | e.g. `treasure-raid` |
| Database password | generate one and **save it** (you won't need it day to day) |
| Region | **Southeast Asia (Singapore)**, the closest to Jakarta |
| Security options → Data API | **Leave it enabled**, exposing the default `public` schema. The site talks to the database through it. |
| Other options | Leave the defaults. If there's an "automatic RLS" option, either choice works because `schema.sql` turns RLS on itself. |

Supabase sometimes renames these options. The one that matters is keeping the **Data API on**.
Wait for the project to finish setting up.

### 2. Run `supabase/schema.sql`

In the dashboard, open **SQL Editor** → **New query**. Paste the whole of
`supabase/schema.sql` and click **Run**. Do this **once** on a fresh project; running it a
second time fails because the tables already exist.

### 3. Run every file in `supabase/migrations/`, in number order

Right now that's only `001_checkpoint_schedule.sql`. Paste it into a new query and click
**Run**.

**Don't skip this step.** `checkpoint_schedule` isn't in `schema.sql`. Without it, the
checkpoint list can't show locked checkpoints ("Checkpoint 2, opens …"). It shows an
"Upcoming unlock times unavailable" error instead.

### 4. Create the Discord application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
   and click **New Application**. Its name and icon are what players see on the login
   screen.
2. Open **OAuth2**. Copy the **Client ID**, then click **Reset Secret** and copy the
   **Client Secret**.
3. Under **Redirects**, add your Supabase callback URL:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   The exact URL is shown as "Callback URL" on Supabase's Discord provider page (next step).
   Click **Save Changes**.

### 5. Enable the Discord provider in Supabase

Go to **Authentication** → **Sign In / Providers** → **Discord**. Turn it on, paste the
Client ID and Client Secret, and click **Save**.

### 6. Set the Site URL and Redirect URLs

Go to **Authentication** → **URL Configuration**.

- **Site URL:** `http://localhost:3000` for now. Change it to your Vercel address in step 9.
- **Redirect URLs:** add both of these:
  ```
  http://localhost:3000/**
  https://<your-app>.vercel.app/**
  ```
  The `/**` matters, because after login the site returns players to the page they wanted
  (e.g. `/auth/callback?next=/puzzles/3`). To test on a phone over Wi-Fi, also add
  `http://<your-pc-ip>:3000/**`.

### 7. Configure and run locally

```bash
git clone <your-repo-url> treasure-raid
cd treasure-raid
npm install
cp .env.example .env.local        # Windows PowerShell: copy .env.example .env.local
```

Open `.env.local` and fill in both values from Supabase **Project Settings** → **API**
(or **API Keys**):

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon / publishable key>
```

Use only the **anon** (a.k.a. publishable) key. **Never** use the `service_role` or secret
key: this app runs in players' browsers, and that key bypasses every security rule.

```bash
npm run dev
```

Open http://localhost:3000 and click **Login with Discord**. After you approve, you should
land on `/puzzles` with your Discord name in the header.

To try every puzzle type, load the test data. **Only on a test project, or delete it
before a real event** (see [Test data](#test-data)):

1. Run `supabase/test-puzzles.sql` (the test event, plus riddle, sudoku and queens).
2. Then run `supabase/test-crossmath.sql`.

### 8. Push to GitHub

Create an empty repository on GitHub, then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env.local` is in `.gitignore`, so your keys stay on your machine.

### 9. Deploy to Vercel

1. On vercel.com: **Add New…** → **Project** → import your GitHub repository. The framework
   (Next.js) is detected automatically.
2. Under **Environment Variables**, add the same two values as `.env.local`, for
   Production and Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Click **Deploy**.
4. Back in Supabase, **Authentication** → **URL Configuration**:
   - Set **Site URL** to your Vercel address, e.g. `https://treasure-raid.vercel.app`.
   - Make sure `https://treasure-raid.vercel.app/**` is in **Redirect URLs**.
5. Open the live site and log in.

If you change an environment variable later, redeploy. `NEXT_PUBLIC_*` values are built into
the site.

## Adding events and puzzles

See **[docs/adding-puzzles.md](docs/adding-puzzles.md)**. It has copy-paste SQL for every
type, a block that creates a whole event in one go, and how to write times in WIB
(`'2026-11-01 20:00:00+07'`). It also covers the workflow:

1. Design the puzzle.
2. Run `npm run check-puzzle -- file.json` until it says it's unique.
3. Insert it.

For crossmath, `npm run -s make-crossmath -- layout.json` designs a unique puzzle for you.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the local dev server. Supabase query results print to the terminal (dev only). |
| `npm run build` / `npm start` | Production build / serve it locally. |
| `npm run lint` | ESLint. |
| `npm test` | Tests for the crossmath rules (`scripts/crossmath.test.mjs`). |
| `npm run check-puzzle -- file.json` | Checks a sudoku, queens or crossmath puzzle has **exactly one** solution, and prints the solution to store. Examples are in `scripts/examples/`. |
| `npm run -s make-crossmath -- layout.json` | Turns a crossmath layout into a finished puzzle with exactly one solution. |

## Test data

`supabase/test-puzzles.sql` and `supabase/test-crossmath.sql` are **test data only**. They
create the event "Grand Treasure Raid: Test Run" with five checkpoints, open now, and answers
that are printed in this repository.

- Run them only on a **test** Supabase project, **or**
- before a real event, run **`supabase/cleanup-test-data.sql`**. It shows what it will remove,
  then deletes the test event and everything attached to it: every test checkpoint, every
  answer, and every player's progress and submitted attempts on those checkpoints. Players'
  profiles (their Discord logins) are kept.

## Before you go live

- [ ] **Replace the test event:** run `supabase/cleanup-test-data.sql`, then create the real
      event ([docs/adding-puzzles.md](docs/adding-puzzles.md)).
- [ ] **Check every puzzle** with `npm run check-puzzle -- file.json` until it says unique.
      Riddles have no checker, so list every spelling you'll accept.
- [ ] **Every time has the `+07` offset:** `starts_at`, `ends_at` and every `opens_at`.
      Confirm with the "shown in WIB" query in docs/adding-puzzles.md.
- [ ] **No puzzle is missing its answer:** run the "puzzles with no answer" query, which
      should return no rows.
- [ ] **Supabase URL settings:** Site URL is the production address, and Redirect URLs
      include `https://<your-app>.vercel.app/**`.
- [ ] **Test on at least two real phones, one iPhone and one Android:**
  - Log in by opening the link from inside the Discord app.
  - Solve one puzzle of each type, including dragging in queens and crossmath.
  - Check the countdowns and the leaderboard.
- [ ] **Production logging is silent:**
  - The `[supabase] …` query logs only appear with `npm run dev`.
  - Check with `npm run build && npm start`, browsing a few pages. The terminal shows no
    `[supabase]` lines.
  - Vercel's runtime logs should show none either.
- [ ] **Prizes:** edit the text at the top of `src/app/rules/page.tsx`.
- [ ] **Times:** the Rules page and the event's dates say what you'll announce in Discord.

## Troubleshooting

**Login fails right away, or the page errors with `your-project-ref` / `fetch failed` / `ENOTFOUND`**
`.env.local` still has the placeholders from `.env.example`. Fill in your real Project URL
and anon key, then **restart** `npm run dev`, which only reads `.env.local` at start-up. On
Vercel, set the variables and redeploy.

**"Could not find the function public.checkpoint_schedule(p_event_id) in the schema cache"
(PGRST202), or "Upcoming unlock times unavailable" on the checkpoint list**

- **Migration not run:** you haven't run `supabase/migrations/001_checkpoint_schedule.sql`
  (step 3).
- **Migration just run:** Supabase's API caches the list of functions. Wait a minute, or run
  this in the SQL Editor:
  ```sql
  notify pgrst, 'reload schema';
  ```

**After approving on Discord, you land on the wrong page**
You might land on the home page instead of `/puzzles`, on `localhost` while using the live
site, or on the live site while testing locally. In each case the address you came from isn't
in Supabase's **Redirect URLs**, so Supabase falls back to the **Site URL**. Add the exact
origin with `/**`: `http://localhost:3000/**`, `https://<your-app>.vercel.app/**`, and your
PC's IP for phone testing. Also check that the Site URL is your production address.

**Discord says "Invalid OAuth2 redirect_uri"**
The redirect in the Discord developer portal must be exactly
`https://<your-project-ref>.supabase.co/auth/v1/callback`. It's Supabase's callback, not
your site's.

**A player's name looks wrong**
Profiles are created from Discord's account data when a player first logs in. Fix one by
hand:

```sql
update public.profiles set display_name = 'New Name' where id = '<user id>';
```

The user id is in **Authentication** → **Users**.

**A puzzle shows "Puzzle data problem"**
Its `data` doesn't match the type's format. Run it through `npm run check-puzzle`, then fix
it in the Table Editor.

**A correct solve is marked wrong**
Either the stored `solution` isn't exactly the answer the site sends, or the puzzle has more
than one solution. Put the `solution` in your check-puzzle JSON and run the checker. It
reports both problems.

**"Easy there, captain!" right after a wrong answer on another checkpoint**
That's by design. The one-minute cooldown after a wrong answer applies across all
checkpoints.

## How it's secured

The database does the enforcing. The site only holds the public anon key.

- **Solutions** (`puzzle_solutions`) can't be read by any player. Answers are checked inside
  the `submit_answer` function.
- **Puzzle content** (`puzzles.data`) is handed out only by `start_puzzle`, which also starts
  the timer. Players can read a puzzle's title and type only after it unlocks, and
  `select *` on `puzzles` is refused.
- **Progress and submissions:** players can read only their own rows. All writes happen
  inside the two functions, which also enforce the cooldown and use the database clock.
- **Logged-out visitors** are redirected away from `/puzzles`, `/puzzles/[id]` and
  `/leaderboard`, and the database refuses them anyway.

The latest review and its open recommendations are in
[docs/security-review.md](docs/security-review.md).

## Project layout

```
src/app/                 pages (/, /login, /auth/*, /puzzles, /puzzles/[id], /leaderboard, /rules)
src/games/               one folder per puzzle type + registry.ts (type → component)
src/games/crossmath/logic.mjs   crossmath rules, shared by the site, scripts and tests
src/lib/                 Supabase clients, server clock, time formatting (WIB)
src/proxy.ts             refreshes the login session, protects routes
supabase/schema.sql      tables, security rules, functions (run once)
supabase/migrations/     run each after schema.sql, in order
supabase/test-*.sql      test data only; cleanup-test-data.sql removes it
scripts/                 check-puzzle, make-crossmath, tests, example puzzles
docs/                    puzzle formats, adding puzzles, security review
```
