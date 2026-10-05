# Adding events and puzzles

There's no admin screen. You create events, puzzles and answers yourself in the Supabase
dashboard: **SQL Editor**, then paste and **Run**. The SQL Editor runs as an admin, so it can
write to the locked tables that players can't touch.

The JSON shape of every puzzle type is in [puzzle-formats.md](puzzle-formats.md).

## The workflow

1. **Design the puzzle** and save it as a JSON file in the check-puzzle format, for example
   `private/my-sudoku.json`. The `private/` folder is git-ignored, so real answers don't end
   up in a public repository:
   ```json
   { "type": "sudoku", "data": { "grid": [[...], ...] } }
   ```
   For crossmath, let `make-crossmath` design it for you (see below).
2. **Check it** (sudoku, queens and crossmath):
   ```bash
   npm run check-puzzle -- private/my-sudoku.json
   ```
   Repeat until it says `✔ … exactly one solution.` It prints the solution to store. The
   server compares answers by exact equality, so a puzzle with two solutions would mark a
   correct solve as wrong. Riddles have no checker; list every spelling you'll accept instead.
3. **Insert it** with one of the SQL blocks below. The puzzle and its answer go in together.
4. **Check the unlock times** (see the next section), then open the site as a player.

## Times: always write `+07`

Players see times in WIB (Asia/Jakarta, UTC+7). The database stores exact moments, so every
time you type **must carry its offset**:

```sql
'2026-11-01 20:00:00+07'   -- 8 pm WIB on 1 November ✔
'2026-11-01 20:00:00'      -- ✖ no offset: the SQL Editor reads this as UTC
```

Without the offset, `20:00` means 20:00 UTC, which is **03:00 WIB the next day**. The
checkpoint unlocks **7 hours late**. Midnight written as `'2026-11-01 00:00:00'` would
unlock at 07:00 WIB instead of 00:00.

Check what you stored, shown in WIB:

```sql
select checkpoint_number, title, opens_at at time zone 'Asia/Jakarta' as opens_wib
from public.puzzles
where event_id = (select id from public.events where name = 'Grand Treasure Raid #1')
order by checkpoint_number;
```

Rules the database enforces:

- An event's `ends_at` must be after its `starts_at`.
- `(event_id, checkpoint_number)` must be unique.
- `points` must be 1 or more (default 1).
- Puzzles can't be started after the event's `ends_at`, and they unlock at their own
  `opens_at`.

## Create a whole event in one go

Edit the names, times, puzzles and answers, then run it once. It creates the event, all its
puzzles and all their answers together. If anything is wrong, nothing is saved.

```sql
with ev as (
  insert into public.events (name, starts_at, ends_at)
  values ('Grand Treasure Raid #1', '2026-11-01 00:00:00+07', '2026-11-15 00:00:00+07')
  returning id
),
pz as (
  insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at, points)
  select ev.id, v.checkpoint_number, v.type, v.title, v.data::jsonb, v.opens_at::timestamptz, v.points
  from ev, (values
    (1, 'riddle', 'The First Gate',
        '{"prompt": "I speak without a mouth and hear without ears. What am I?"}',
        '2026-11-01 20:00:00+07', 1),
    (2, 'sudoku', 'The Captain''s Grid',
        '{"grid":[[5,3,0,0,7,0,0,0,0],[6,0,0,1,9,5,0,0,0],[0,9,8,0,0,0,0,6,0],[8,0,0,0,6,0,0,0,3],[4,0,0,8,0,3,0,0,1],[7,0,0,0,2,0,0,0,6],[0,6,0,0,0,0,2,8,0],[0,0,0,4,1,9,0,0,5],[0,0,0,0,8,0,0,7,9]]}',
        '2026-11-04 20:00:00+07', 1),
    (3, 'queens', 'Seven Crowns',
        '{"size":7,"regions":[[0,0,1,1,1,1,1],[0,2,5,1,1,1,1],[0,2,5,3,1,1,1],[5,5,5,3,3,4,4],[5,5,5,3,3,4,4],[5,5,5,5,4,4,4],[5,5,5,5,4,4,6]]}',
        '2026-11-08 20:00:00+07', 1),
    (4, 'crossmath', 'Sums of the Sea',
        '{"cells":[["_","+","_","-","_","=",6],["-",null,"*",null,"+",null,null],["_","*","_","-","_","=",17],["+",null,"-",null,"*",null,null],["_","+","_","*","_","=",34],["=",null,"=",null,"=",null,null],[12,null,23,null,12,null,null]],"pool":[1,2,3,4,5,6,7,8,9]}',
        '2026-11-12 20:00:00+07', 2)
  ) as v(checkpoint_number, type, title, data, opens_at, points)
  returning id, checkpoint_number
)
insert into public.puzzle_solutions (puzzle_id, solution)
select pz.id, s.solution::jsonb
from pz
join (values
  (1, '["echo", "an echo"]'),
  (2, '[[5,3,4,6,7,8,9,1,2],[6,7,2,1,9,5,3,4,8],[1,9,8,3,4,2,5,6,7],[8,5,9,7,6,1,4,2,3],[4,2,6,8,5,3,7,9,1],[7,1,3,9,2,4,8,5,6],[9,6,1,5,3,7,2,8,4],[2,8,7,4,1,9,6,3,5],[3,4,5,2,8,6,1,7,9]]'),
  (3, '[0,4,1,3,5,2,6]'),
  (4, '[8,3,5,2,9,1,6,4,7]')
) as s(checkpoint_number, solution) using (checkpoint_number);
```

- Write quotes inside text as two single quotes: `'The Captain''s Grid'`.
- Every checkpoint in the first list needs a row in the answers list with the same number.
  Check afterwards with the "missing answers" query at the end of this page.

## Add one puzzle to an existing event

Each block finds the event by name, so you don't need its id. Change the name, checkpoint
number, title, data, time and answer.

### riddle

The answer matches if it equals any accepted string, ignoring case and extra spaces. List
every spelling you'll accept.

```sql
with p as (
  insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at)
  select id, 5, 'riddle', 'The Silent Bell',
         '{"prompt": "The more you take, the more you leave behind. What are they?"}',
         '2026-11-13 20:00:00+07'
  from public.events where name = 'Grand Treasure Raid #1'
  returning id
)
insert into public.puzzle_solutions (puzzle_id, solution)
select id, '["footsteps", "steps", "footprints"]'::jsonb from p;
```

A prompt can have line breaks: write `\n` inside the JSON string.

### sudoku

`grid` uses `0` for empty cells. The answer is the full solved grid from `check-puzzle`.

```sql
with p as (
  insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at)
  select id, 6, 'sudoku', 'The Captain''s Grid',
         '{"grid":[[5,3,0,0,7,0,0,0,0],[6,0,0,1,9,5,0,0,0],[0,9,8,0,0,0,0,6,0],[8,0,0,0,6,0,0,0,3],[4,0,0,8,0,3,0,0,1],[7,0,0,0,2,0,0,0,6],[0,6,0,0,0,0,2,8,0],[0,0,0,4,1,9,0,0,5],[0,0,0,0,8,0,0,7,9]]}',
         '2026-11-14 20:00:00+07'
  from public.events where name = 'Grand Treasure Raid #1'
  returning id
)
insert into public.puzzle_solutions (puzzle_id, solution)
select id, '[[5,3,4,6,7,8,9,1,2],[6,7,2,1,9,5,3,4,8],[1,9,8,3,4,2,5,6,7],[8,5,9,7,6,1,4,2,3],[4,2,6,8,5,3,7,9,1],[7,1,3,9,2,4,8,5,6],[9,6,1,5,3,7,2,8,4],[2,8,7,4,1,9,6,3,5],[3,4,5,2,8,6,1,7,9]]'::jsonb
from p;
```

### queens

`regions` uses ids `0` to `size - 1`. The answer lists, for each row from the top, the
**0-based** column of its queen.

```sql
with p as (
  insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at)
  select id, 7, 'queens', 'Seven Crowns',
         '{"size":7,"regions":[[0,0,1,1,1,1,1],[0,2,5,1,1,1,1],[0,2,5,3,1,1,1],[5,5,5,3,3,4,4],[5,5,5,3,3,4,4],[5,5,5,5,4,4,4],[5,5,5,5,4,4,6]]}',
         '2026-11-14 20:00:00+07'
  from public.events where name = 'Grand Treasure Raid #1'
  returning id
)
insert into public.puzzle_solutions (puzzle_id, solution)
select id, '[0,4,1,3,5,2,6]'::jsonb from p;
```

### crossmath

The answer is the value in each blank (`"_"`), in reading order: top row first, left to
right.

```sql
with p as (
  insert into public.puzzles (event_id, checkpoint_number, type, title, data, opens_at)
  select id, 8, 'crossmath', 'Sums of the Sea',
         '{"cells":[["_","+","_","-","_","=",6],["-",null,"*",null,"+",null,null],["_","*","_","-","_","=",17],["+",null,"-",null,"*",null,null],["_","+","_","*","_","=",34],["=",null,"=",null,"=",null,null],[12,null,23,null,12,null,null]],"pool":[1,2,3,4,5,6,7,8,9]}',
         '2026-11-14 20:00:00+07'
  from public.events where name = 'Grand Treasure Raid #1'
  returning id
)
insert into public.puzzle_solutions (puzzle_id, solution)
select id, '[8,3,5,2,9,1,6,4,7]'::jsonb from p;
```

## Making a crossmath with `make-crossmath`

1. Copy `scripts/examples/crossmath-layout.json` and edit it:
   - Put `"_"` where players place numbers.
   - Use `"+" "-" "*" "/"` and `"="` for the operators and equals signs.
   - Put `"#"` after each `=` where the script should compute the result.
   - Use `null` for gaps.
   - The `pool` holds the numbers to place: whole numbers 1 and up, one per blank.
2. Run it:
   ```bash
   npm run -s make-crossmath -- my-layout.json > my-crossmath.json
   ```
   It tries random fillings until the finished puzzle has exactly one solution, then
   writes the puzzle JSON, which includes `"solution"`.
3. Double-check it: `npm run check-puzzle -- my-crossmath.json`
4. Paste `data` and `solution` from `my-crossmath.json` into the crossmath SQL block above.
   `data` is everything inside `"data": { … }`, which is the `cells` and `pool`.

If it finds nothing, raise `tries`, change the pool, use more × and ÷, or fix a blank as a
number. All options are in [puzzle-formats.md](puzzle-formats.md#making-a-crossmath-puzzle-npm-run-make-crossmath).

## Changing or removing things

```sql
-- Move an unlock time
update public.puzzles set opens_at = '2026-11-05 20:00:00+07'
where event_id = (select id from public.events where name = 'Grand Treasure Raid #1')
  and checkpoint_number = 2;

-- Fix an answer
update public.puzzle_solutions set solution = '["echo", "an echo", "the echo"]'
where puzzle_id = (select p.id from public.puzzles p join public.events e on e.id = p.event_id
                   where e.name = 'Grand Treasure Raid #1' and p.checkpoint_number = 1);

-- Delete one puzzle (its answer and everyone's progress on it go too)
delete from public.puzzles
where event_id = (select id from public.events where name = 'Grand Treasure Raid #1')
  and checkpoint_number = 8;
```

Don't edit a puzzle's `data` after players have started it. Their saved boards would no
longer match.

## Final check: puzzles with no answer

A puzzle without a row in `puzzle_solutions` can be started but never solved. This should
return no rows:

```sql
select e.name, p.checkpoint_number, p.title
from public.puzzles p
join public.events e on e.id = p.event_id
left join public.puzzle_solutions s on s.puzzle_id = p.id
where s.puzzle_id is null;
```
