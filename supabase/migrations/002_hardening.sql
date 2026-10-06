-- =====================================================================
-- 002: hardening
-- Run once in Supabase Dashboard -> SQL Editor, after schema.sql and 001.
-- Safe to re-run.
--
--   * Display names must be 1 to 32 characters (after trimming spaces).
--     Players can still rename themselves through the API; this limits what
--     they can set, and the signup trigger always produces a valid name.
--   * Stored answers are capped at 4000 bytes (real answers are well under 500).
-- No other rules change.
-- =====================================================================

-- Names: fix any existing name first, so adding the rule can't fail
update public.profiles
set display_name = coalesce(nullif(btrim(left(btrim(display_name), 32)), ''), 'Player')
where char_length(btrim(display_name)) not between 1 and 32;

alter table public.profiles drop constraint if exists profiles_display_name_length;
alter table public.profiles
  add constraint profiles_display_name_length
  check (char_length(btrim(display_name)) between 1 and 32);

-- Signup trigger: always produce a valid, trimmed name.
-- Blank or space-only values fall through to the next candidate.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := btrim(left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''),
    'Player'), 32));
  if v_name = '' then v_name := 'Player'; end if;

  insert into public.profiles (id, discord_username, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name',
                  new.raw_user_meta_data ->> 'user_name',
                  new.raw_user_meta_data ->> 'name'), 64),
    v_name
  );
  return new;
end;
$$;

-- Keep the trigger function out of players' reach (same as schema.sql)
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Answers: at most 4000 bytes. "not valid" applies the rule to new attempts
-- only, so an oversized old row can't block the migration.
alter table public.submissions drop constraint if exists submissions_answer_size;
alter table public.submissions
  add constraint submissions_answer_size
  check (octet_length(answer::text) <= 4000) not valid;
