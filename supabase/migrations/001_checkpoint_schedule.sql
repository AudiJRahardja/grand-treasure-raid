-- =====================================================================
-- 001: checkpoint_schedule(event_id)
-- Run once in Supabase Dashboard -> SQL Editor, after schema.sql.
--
-- Players cannot see a puzzles row until its opens_at has passed (RLS), so
-- the site cannot show "Checkpoint 2, opens Tue 20:00" for locked ones.
-- This returns ONLY checkpoint numbers and unlock times for one event:
-- no titles, types, data or solutions. Logged-in players only (not anon).
-- The existing tables, policies and grants are unchanged.
-- =====================================================================

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
  order by p.checkpoint_number;
$$;

revoke all on function public.checkpoint_schedule(bigint) from public, anon;
grant execute on function public.checkpoint_schedule(bigint) to authenticated;
