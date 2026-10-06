-- =====================================================================
-- 003: BGDC Discord server membership
-- Run once in Supabase Dashboard -> SQL Editor, after schema.sql, 001 and 002.
-- Safe to re-run.
--
-- Only verified members of the BGDC Discord server can see puzzles, play,
-- or see and appear on the leaderboard. The site checks membership with
-- Discord at every login and records the result here (server side only).
-- A check is valid for 21 days; after that the player logs in again.
--
-- Everything here ADDS a requirement; no existing rule is loosened. It also
-- removes players' ability to rename themselves (no page ever offered it).
-- =====================================================================

-- ---------------------------------------------------------------------
-- The latest membership check per player. Written only through
-- record_guild_check(), which only the site's server (secret key) can call.
-- Players can read their own row and nothing else.
-- ---------------------------------------------------------------------
create table if not exists public.guild_members (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  discord_id text        not null,
  is_member  boolean     not null,
  checked_at timestamptz not null default now()
);

alter table public.guild_members enable row level security;
revoke all on public.guild_members from anon, authenticated;
grant select on public.guild_members to authenticated;
drop policy if exists "read own membership" on public.guild_members;
create policy "read own membership" on public.guild_members
  for select to authenticated using (user_id = (select auth.uid()));

-- How long a check stays valid
create or replace function public.guild_check_days()
returns int
language sql
immutable
as $$ select 21; $$;

-- True if the current player is a member with a check from the last 21 days
create or replace function public.is_guild_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guild_members g
    where g.user_id = auth.uid()
      and g.is_member
      and g.checked_at > now() - make_interval(days => public.guild_check_days())
  );
$$;

-- For the site: status 'member' | 'not_member' | 'expired' | 'missing', plus dates
create or replace function public.my_guild_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when g.user_id is null then
      jsonb_build_object('status', 'missing')
    when g.checked_at <= now() - make_interval(days => public.guild_check_days()) then
      jsonb_build_object('status', 'expired', 'checked_at', g.checked_at)
    when g.is_member then
      jsonb_build_object('status', 'member', 'checked_at', g.checked_at,
                         'expires_at', g.checked_at + make_interval(days => public.guild_check_days()))
    else
      jsonb_build_object('status', 'not_member', 'checked_at', g.checked_at)
  end
  from (select auth.uid() as uid) me
  left join public.guild_members g on g.user_id = me.uid;
$$;

-- Called by the site's server after asking Discord. Refuses unless the
-- Discord id really is this user's linked Discord account.
create or replace function public.record_guild_check(p_user_id uuid, p_discord_id text, p_is_member boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from auth.identities i
    where i.user_id = p_user_id
      and i.provider = 'discord'
      and i.provider_id = p_discord_id
  ) then
    raise exception 'Discord id does not match this user';
  end if;

  insert into public.guild_members (user_id, discord_id, is_member, checked_at)
  values (p_user_id, p_discord_id, p_is_member, now())
  on conflict (user_id) do update
    set discord_id = excluded.discord_id,
        is_member  = excluded.is_member,
        checked_at = excluded.checked_at;
end;
$$;

revoke all on function public.guild_check_days()                         from public, anon;
revoke all on function public.is_guild_member()                          from public, anon;
revoke all on function public.my_guild_status()                          from public, anon;
revoke all on function public.record_guild_check(uuid, text, boolean)    from public, anon, authenticated;
grant execute on function public.guild_check_days()                      to authenticated;
grant execute on function public.is_guild_member()                       to authenticated;
grant execute on function public.my_guild_status()                       to authenticated;
grant execute on function public.record_guild_check(uuid, text, boolean) to service_role;


-- ---------------------------------------------------------------------
-- Puzzles: unlocked AND the player is a verified member
-- ---------------------------------------------------------------------
drop policy if exists "read unlocked puzzles" on public.puzzles;
create policy "read unlocked puzzles" on public.puzzles
  for select to authenticated using (opens_at <= now() and public.is_guild_member());

-- Locked-checkpoint times: members only (non-members get no rows)
create or replace function public.checkpoint_schedule(p_event_id bigint)
returns table (checkpoint_number int, opens_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.checkpoint_number, p.opens_at
  from public.puzzles p
  where p.event_id = p_event_id
    and public.is_guild_member()
  order by p.checkpoint_number;
$$;


-- ---------------------------------------------------------------------
-- start_puzzle and submit_answer: identical to schema.sql except for the
-- membership check right after the login check.
-- ---------------------------------------------------------------------
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

  -- 003: only verified BGDC server members can play
  if not public.is_guild_member() then
    raise exception 'Not a verified BGDC member';
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

  -- 003: only verified BGDC server members can play
  if not public.is_guild_member() then
    raise exception 'Not a verified BGDC member';
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


-- ---------------------------------------------------------------------
-- Leaderboard: only members are listed and ranked, and only verified
-- members can see it. Being listed uses each player's latest check, so a
-- member isn't dropped from the standings just because their check is
-- older than 21 days. Seeing it needs a current check, like playing.
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
  join public.guild_members gm on gm.user_id = pr.user_id and gm.is_member
  where pr.solved_at is not null
  group by pu.event_id, pr.user_id, pf.display_name
) t
where public.is_guild_member();


-- ---------------------------------------------------------------------
-- Players can no longer rename themselves (no page offered it)
-- ---------------------------------------------------------------------
revoke update (display_name) on public.profiles from authenticated;
drop policy if exists "rename own profile" on public.profiles;
