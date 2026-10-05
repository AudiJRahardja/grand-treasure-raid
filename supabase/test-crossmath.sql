-- =====================================================================
-- TEST DATA ONLY. Run on a test project, or remove it before a real event
-- with supabase/cleanup-test-data.sql.
--
-- Adds checkpoint 5 (crossmath, open now) to "Grand Treasure Raid: Test Run".
-- Run supabase/test-puzzles.sql first (it creates the event).
-- Same puzzle as scripts/examples/crossmath.json, verified unique with
--   npm run check-puzzle -- scripts/examples/crossmath.json
-- Safe to re-run: skipped if checkpoint 5 already exists.
-- =====================================================================

with ev as (
  select id from public.events where name = 'Grand Treasure Raid: Test Run'
),
p as (
  insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at)
  select ev.id, 5, 'crossmath', 'Sums of the Sea',
    '{"cells":[["_","+","_","-","_","=",6],["-",null,"*",null,"+",null,null],["_","*","_","-","_","=",17],["+",null,"-",null,"*",null,null],["_","+","_","*","_","=",34],["=",null,"=",null,"=",null,null],[12,null,23,null,12,null,null]],"pool":[1,2,3,4,5,6,7,8,9]}',
    now()
  from ev
  on conflict (event_id, checkpoint_number) do nothing
  returning id
)
insert into public.puzzle_solutions (puzzle_id, solution)
select id, '[8,3,5,2,9,1,6,4,7]'::jsonb
from p;
