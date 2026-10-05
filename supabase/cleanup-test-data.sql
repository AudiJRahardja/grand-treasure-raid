-- =====================================================================
-- Removes the test event and EVERYTHING attached to it:
--   its puzzles (all test checkpoints), their answers (puzzle_solutions),
--   every player's progress and every submitted attempt on those puzzles.
-- Players' profiles (their Discord logins) are kept.
--
-- Run before a real event if you tested on your production project.
-- Paste into Supabase Dashboard -> SQL Editor -> Run.
-- =====================================================================

-- 1. What will be deleted (shown in the results panel)
select
  e.id as event_id,
  e.name,
  (select count(*) from public.puzzles p where p.event_id = e.id) as puzzles,
  (select count(*) from public.puzzle_solutions s
     join public.puzzles p on p.id = s.puzzle_id where p.event_id = e.id) as answers,
  (select count(*) from public.progress pr
     join public.puzzles p on p.id = pr.puzzle_id where p.event_id = e.id) as progress_rows,
  (select count(*) from public.submissions su
     join public.puzzles p on p.id = su.puzzle_id where p.event_id = e.id) as submissions
from public.events e
where e.name = 'Grand Treasure Raid: Test Run';

-- 2. Delete. Puzzles, answers, progress and submissions go with the event
--    (every foreign key is "on delete cascade").
delete from public.events
where name = 'Grand Treasure Raid: Test Run';

-- 3. Check: everything below should be 0
select
  (select count(*) from public.events where name = 'Grand Treasure Raid: Test Run') as test_events_left,
  (select count(*) from public.puzzles p
     where not exists (select 1 from public.events e where e.id = p.event_id)) as orphan_puzzles,
  (select count(*) from public.puzzle_solutions s
     where not exists (select 1 from public.puzzles p where p.id = s.puzzle_id)) as orphan_answers;
