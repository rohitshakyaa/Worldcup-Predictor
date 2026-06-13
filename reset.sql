-- ============================================================================
-- RESET — wipe ALL app data & objects from the public schema so you can start
-- fresh. DESTRUCTIVE: drops every app table, function, and the seeded demo
-- auth users. Run this ONLY if you want a clean slate, then run schema.sql and
-- seed.sql again. (A brand-new Supabase project needs NO reset — just run
-- schema.sql then seed.sql.)
-- ============================================================================

-- Drop the signup trigger first (depends on a public function).
drop trigger if exists on_auth_user_created on auth.users;

-- Drop all app tables (cascade removes their RLS policies, FKs, indexes).
drop table if exists
  public.bracket_picks,
  public.third_slot_picks,
  public.predictions,
  public.group_position_picks,
  public.knockout_picks,
  public.champion_picks,
  public.league_members,
  public.leagues,
  public.matches,
  public.teams,
  public.groups,
  public.profiles,
  public.app_config
cascade;

-- Drop every function defined in the public schema (all our RPCs + helpers).
do $$
declare r record;
begin
  for r in
    select oid::regprocedure as sig
    from pg_proc
    where pronamespace = 'public'::regnamespace
  loop
    execute 'drop function if exists ' || r.sig || ' cascade';
  end loop;
end $$;

-- Remove the seeded demo auth accounts (so seed.sql can recreate them cleanly).
delete from auth.users
where id in (
  '11111111-1111-1111-1111-111111111111',  -- test@example.com  (Priyanka)
  '22222222-2222-2222-2222-222222222222',  -- rohit@example.com
  '44444444-4444-4444-4444-444444444444'   -- admin@example.com
);
