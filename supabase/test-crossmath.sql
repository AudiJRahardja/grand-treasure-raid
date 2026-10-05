-- Test crossmath puzzle (checkpoint 5 of event 1, opens immediately).
-- Paste into Supabase Dashboard -> SQL Editor -> Run.
-- Same puzzle as scripts/examples/crossmath.json, verified unique with
--   npm run check-puzzle -- scripts/examples/crossmath.json
-- Inserts the puzzle and its solution together, so no id lookup is needed.

with p as (
  insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at)
  values (1, 5, 'crossmath', 'Sums of the Sea',
    '{"cells":[["_","+","_","-","_","=",6],["-",null,"*",null,"+",null,null],["_","*","_","-","_","=",17],["+",null,"-",null,"*",null,null],["_","+","_","*","_","=",34],["=",null,"=",null,"=",null,null],[12,null,23,null,12,null,null]],"pool":[1,2,3,4,5,6,7,8,9]}',
    now())
  returning id
)
insert into public.puzzle_solutions (puzzle_id, solution)
select id, '[8,3,5,2,9,1,6,4,7]'::jsonb
from p;

-- To undo:
-- delete from public.puzzles where event_id = 1 and checkpoint_number = 5;
