-- =====================================================================
-- The Grand Treasure Raid: Supabase schema
-- Paste into Supabase Dashboard -> SQL Editor -> Run (once).
-- Players only talk to the database through:
--   * RLS-protected reads (own progress, open puzzles' metadata, leaderboard)
--   * three functions: server_now(), start_puzzle(), submit_answer()
-- =====================================================================


-- ---------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------

-- One row per user, created automatically on signup (see trigger below)
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  discord_username text,
  display_name     text not null,
  created_at       timestamptz not null default now()
);

-- One row per 2-week run
create table public.events (
  id         bigint generated always as identity primary key,
  name       text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  created_at timestamptz not null default now(),
  constraint events_dates_valid check (ends_at > starts_at)
);

-- The puzzles. "data" is the playable part only (givens, prompt, regions...).
-- Players can see the metadata columns once opens_at has passed, but "data"
-- is only handed out by start_puzzle(), which also starts their timer.
create table public.puzzles (
  id                bigint generated always as identity primary key,
  event_id          bigint not null references public.events (id) on delete cascade,
  checkpoint_number int    not null,
  type              text   not null
                    check (type in ('riddle', 'sudoku', 'queens', 'crossmath', 'other')),
  title             text   not null,
  data              jsonb  not null default '{}'::jsonb,
  opens_at          timestamptz not null,
  points            int    not null default 1 check (points > 0),
  unique (event_id, checkpoint_number)
);

-- SECRET. No client can read this table; only the functions below can.
--   riddle    -> JSON array of accepted answers, e.g. ["echo", "an echo"]
--   others    -> the exact answer JSON the site submits (see docs in the prompt)
create table public.puzzle_solutions (
  puzzle_id bigint primary key references public.puzzles (id) on delete cascade,
  solution  jsonb not null
);

-- One row per user per puzzle. Created by start_puzzle(), updated by submit_answer().
create table public.progress (
  user_id        uuid   not null references public.profiles (id) on delete cascade,
  puzzle_id      bigint not null references public.puzzles (id) on delete cascade,
  opened_at      timestamptz not null default now(),
  solved_at      timestamptz,
  solve_seconds  int,
  wrong_attempts int not null default 0,
  primary key (user_id, puzzle_id)
);

-- Log of every attempt (used for the cooldown and for spotting cheating)
create table public.submissions (
  id           bigint generated always as identity primary key,
  user_id      uuid   not null references public.profiles (id) on delete cascade,
  puzzle_id    bigint not null references public.puzzles (id) on delete cascade,
  answer       jsonb  not null,
  is_correct   boolean not null,
  submitted_at timestamptz not null default now()
);

create index submissions_user_time_idx on public.submissions (user_id, submitted_at desc);
create index progress_puzzle_idx       on public.progress (puzzle_id);


-- ---------------------------------------------------------------------
-- AUTO-CREATE A PROFILE WHEN SOMEONE SIGNS UP
-- Discord metadata key names can vary, so several are tried. Check what your
-- first test login actually stores in auth.users.raw_user_meta_data.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, discord_username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'user_name',
             new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name',
             new.raw_user_meta_data ->> 'user_name',
             split_part(coalesce(new.email, ''), '@', 1),
             'Player')
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
-- FUNCTIONS (all timestamps come from the database clock)
-- ---------------------------------------------------------------------

-- Lets the site sync its countdown timers with the real server time
create or replace function public.server_now()
returns timestamptz
language sql
stable
as $$ select now(); $$;


-- Starts the player's timer and returns the puzzle content.
-- Calling it again returns the same opened_at (the timer never resets).
create or replace function public.start_puzzle(p_puzzle_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_puzzle public.puzzles%rowtype;
  v_opened timestamptz;
begin
  if v_uid is null then
    raise exception 'Not logged in';
  end if;

  select p.* into v_puzzle
  from public.puzzles p
  join public.events e on e.id = p.event_id
  where p.id = p_puzzle_id
    and p.opens_at <= now()
    and now() <= e.ends_at;

  if not found then
    raise exception 'Puzzle not available';
  end if;

  insert into public.progress (user_id, puzzle_id)
  values (v_uid, p_puzzle_id)
  on conflict (user_id, puzzle_id) do nothing;

  select opened_at into v_opened
  from public.progress
  where user_id = v_uid and puzzle_id = p_puzzle_id;

  return jsonb_build_object(
    'puzzle_id', v_puzzle.id,
    'type',      v_puzzle.type,
    'title',     v_puzzle.title,
    'data',      v_puzzle.data,
    'opened_at', v_opened
  );
end;
$$;


-- Checks an answer on the server, enforces the cooldown, records the result.
-- Returns JSON such as:
--   {"ok": true,  "correct": true,  "solve_seconds": 93}
--   {"ok": true,  "correct": false, "retry_in_seconds": 60}
--   {"ok": false, "reason": "cooldown", "retry_in_seconds": 41}
--   {"ok": true,  "already_solved": true}
create or replace function public.submit_answer(p_puzzle_id bigint, p_answer jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_cooldown constant int := 60;      -- seconds between WRONG attempts
  v_type     text;
  v_solution jsonb;
  v_prog     public.progress%rowtype;
  v_last     timestamptz;
  v_wait     int;
  v_correct  boolean;
  v_seconds  int;
begin
  if v_uid is null then
    raise exception 'Not logged in';
  end if;

  select p.type, s.solution into v_type, v_solution
  from public.puzzles p
  join public.puzzle_solutions s on s.puzzle_id = p.id
  join public.events e on e.id = p.event_id
  where p.id = p_puzzle_id
    and p.opens_at <= now()
    and now() <= e.ends_at;

  if not found then
    raise exception 'Puzzle not available';
  end if;

  -- Lock this player's row so double-clicks can't race
  select * into v_prog
  from public.progress
  where user_id = v_uid and puzzle_id = p_puzzle_id
  for update;

  if not found then
    raise exception 'Start the puzzle first';
  end if;

  if v_prog.solved_at is not null then
    return jsonb_build_object('ok', true, 'already_solved', true);
  end if;

  -- Cooldown: one wrong attempt per minute, across all puzzles
  select max(submitted_at) into v_last
  from public.submissions
  where user_id = v_uid and is_correct = false;

  if v_last is not null and v_last > now() - make_interval(secs => v_cooldown) then
    v_wait := ceil(extract(epoch from (v_last + make_interval(secs => v_cooldown) - now())))::int;
    return jsonb_build_object('ok', false, 'reason', 'cooldown', 'retry_in_seconds', v_wait);
  end if;

  -- Check the answer
  if v_type = 'riddle' then
    -- Case-insensitive, whitespace-trimmed match against any accepted answer
    v_correct := exists (
      select 1
      from jsonb_array_elements_text(
             case when jsonb_typeof(v_solution) = 'array'
                  then v_solution
                  else jsonb_build_array(v_solution) end
           ) as a(val)
      where regexp_replace(lower(btrim(a.val)), '\s+', ' ', 'g')
          = regexp_replace(lower(btrim(p_answer #>> '{}')), '\s+', ' ', 'g')
    );
  else
    -- Grid-style puzzles: submitted JSON must equal the stored solution exactly
    v_correct := (p_answer = v_solution);
  end if;

  insert into public.submissions (user_id, puzzle_id, answer, is_correct)
  values (v_uid, p_puzzle_id, p_answer, v_correct);

  if v_correct then
    v_seconds := greatest(0, extract(epoch from (now() - v_prog.opened_at))::int);
    update public.progress
    set solved_at = now(), solve_seconds = v_seconds
    where user_id = v_uid and puzzle_id = p_puzzle_id;

    return jsonb_build_object('ok', true, 'correct', true, 'solve_seconds', v_seconds);
  else
    update public.progress
    set wrong_attempts = wrong_attempts + 1
    where user_id = v_uid and puzzle_id = p_puzzle_id;

    return jsonb_build_object('ok', true, 'correct', false, 'retry_in_seconds', v_cooldown);
  end if;
end;
$$;

revoke all on function public.start_puzzle(bigint)         from public, anon;
revoke all on function public.submit_answer(bigint, jsonb) from public, anon;
revoke all on function public.server_now()                 from public, anon;
grant execute on function public.start_puzzle(bigint)         to authenticated;
grant execute on function public.submit_answer(bigint, jsonb) to authenticated;
grant execute on function public.server_now()                 to authenticated;


-- ---------------------------------------------------------------------
-- LEADERBOARD VIEW
-- Ranked by points (1 per puzzle by default), then lowest total solve time,
-- then whoever finished earliest. Runs with owner rights so it can show
-- everyone's display name and totals without exposing the raw tables.
-- ---------------------------------------------------------------------

create or replace view public.leaderboard as
select
  event_id,
  user_id,
  display_name,
  solved_count,
  total_points,
  total_seconds,
  last_solved_at,
  rank() over (
    partition by event_id
    order by total_points desc, total_seconds asc, last_solved_at asc
  ) as rank
from (
  select
    pu.event_id,
    pr.user_id,
    pf.display_name,
    count(*)::int            as solved_count,
    sum(pu.points)::int      as total_points,
    sum(pr.solve_seconds)::int as total_seconds,
    max(pr.solved_at)        as last_solved_at
  from public.progress pr
  join public.puzzles  pu on pu.id = pr.puzzle_id
  join public.profiles pf on pf.id = pr.user_id
  where pr.solved_at is not null
  group by pu.event_id, pr.user_id, pf.display_name
) t;

revoke all on public.leaderboard from anon, authenticated;
grant select on public.leaderboard to authenticated;


-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY + PRIVILEGES
-- ---------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.events           enable row level security;
alter table public.puzzles          enable row level security;
alter table public.puzzle_solutions enable row level security;
alter table public.progress         enable row level security;
alter table public.submissions      enable row level security;

-- Start from nothing, then grant only what players need
revoke all on public.profiles, public.events, public.puzzles,
              public.puzzle_solutions, public.progress, public.submissions
  from anon, authenticated;

-- profiles: read and rename yourself
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "rename own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- events: everyone logged in can see them
grant select on public.events to authenticated;
create policy "read events" on public.events
  for select to authenticated using (true);

-- puzzles: metadata only, and only after opens_at.
-- The "data" column is deliberately NOT granted; use start_puzzle() for it.
grant select (id, event_id, checkpoint_number, type, title, opens_at, points)
  on public.puzzles to authenticated;
create policy "read unlocked puzzles" on public.puzzles
  for select to authenticated using (opens_at <= now());

-- puzzle_solutions: RLS on, no policies, no grants = invisible to all clients

-- progress and submissions: read your own rows only; writes only via functions
grant select on public.progress to authenticated;
create policy "read own progress" on public.progress
  for select to authenticated using (user_id = (select auth.uid()));

grant select on public.submissions to authenticated;
create policy "read own submissions" on public.submissions
  for select to authenticated using (user_id = (select auth.uid()));


-- ---------------------------------------------------------------------
-- OPTIONAL: EXAMPLE DATA (uncomment, run once, edit later in Table Editor)
-- The SQL Editor runs as an admin, so it can write to the locked tables.
-- ---------------------------------------------------------------------

-- insert into public.events (name, starts_at, ends_at)
-- values ('Grand Treasure Raid: Test Run', now(), now() + interval '14 days');
--
-- insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at)
-- values (1, 1, 'riddle', 'The First Gate',
--         '{"prompt": "I speak without a mouth and hear without ears. What am I?"}',
--         now());
--
-- insert into public.puzzle_solutions (puzzle_id, solution)
-- values (1, '["echo", "an echo"]');
