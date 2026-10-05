-- =====================================================================
-- TEST DATA ONLY. Run on a test project, or remove it before a real event
-- with supabase/cleanup-test-data.sql.
--
-- Creates the event "Grand Treasure Raid: Test Run" (now -> +14 days) and:
--   checkpoint 1  riddle   open now          answer: echo
--   checkpoint 2  riddle   opens in 1 day    answer: piano
--   checkpoint 3  sudoku   open now          (scripts/examples/sudoku.json)
--   checkpoint 4  queens   open now          (scripts/examples/queens.json)
-- Crossmath (checkpoint 5) is in supabase/test-crossmath.sql.
--
-- Safe to re-run: the event is created once, and checkpoints that already
-- exist are skipped (with their answers).
-- Paste into Supabase Dashboard -> SQL Editor -> Run.
-- =====================================================================

insert into public.events (name, starts_at, ends_at)
select 'Grand Treasure Raid: Test Run', now(), now() + interval '14 days'
where not exists (select 1 from public.events where name = 'Grand Treasure Raid: Test Run');

with ev as (
  select id from public.events where name = 'Grand Treasure Raid: Test Run'
),
pz as (
  insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at)
  select ev.id, v.checkpoint_number, v.type, v.title, v.data::jsonb, v.opens_at
  from ev, (values
    (1, 'riddle', 'The First Gate',
        '{"prompt": "I speak without a mouth and hear without ears. What am I?"}',
        now()),
    (2, 'riddle', 'The Locked Chest',
        '{"prompt": "What has keys but can''t open locks?"}',
        now() + interval '1 day'),
    (3, 'sudoku', 'The Captain''s Grid',
        '{"grid":[[5,3,0,0,7,0,0,0,0],[6,0,0,1,9,5,0,0,0],[0,9,8,0,0,0,0,6,0],[8,0,0,0,6,0,0,0,3],[4,0,0,8,0,3,0,0,1],[7,0,0,0,2,0,0,0,6],[0,6,0,0,0,0,2,8,0],[0,0,0,4,1,9,0,0,5],[0,0,0,0,8,0,0,7,9]]}',
        now()),
    (4, 'queens', 'Seven Crowns',
        '{"size":7,"regions":[[0,0,1,1,1,1,1],[0,2,5,1,1,1,1],[0,2,5,3,1,1,1],[5,5,5,3,3,4,4],[5,5,5,3,3,4,4],[5,5,5,5,4,4,4],[5,5,5,5,4,4,6]]}',
        now())
  ) as v(checkpoint_number, type, title, data, opens_at)
  on conflict (event_id, checkpoint_number) do nothing
  returning id, checkpoint_number
)
insert into public.puzzle_solutions (puzzle_id, solution)
select pz.id, s.solution::jsonb
from pz
join (values
  (1, '["echo", "an echo"]'),
  (2, '["piano", "a piano", "keyboard", "a keyboard"]'),
  (3, '[[5,3,4,6,7,8,9,1,2],[6,7,2,1,9,5,3,4,8],[1,9,8,3,4,2,5,6,7],[8,5,9,7,6,1,4,2,3],[4,2,6,8,5,3,7,9,1],[7,1,3,9,2,4,8,5,6],[9,6,1,5,3,7,2,8,4],[2,8,7,4,1,9,6,3,5],[3,4,5,2,8,6,1,7,9]]'),
  (4, '[0,4,1,3,5,2,6]')
) as s(checkpoint_number, solution) using (checkpoint_number);
