-- ============================================================================
-- MIGRATION — pre-tournament connected bracket + admin-controlled lock.
-- Run this ONCE in the Supabase SQL editor if you already ran the earlier
-- schema.sql. (A fresh project can just run the updated schema.sql instead.)
-- Then re-run the updated seed.sql to load FIFA rankings + the lock config row.
-- ============================================================================

-- 1) Pre-tournament lock is now admin-controlled (flag in app_config), not date.
create or replace function public.pretournament_locked()
returns boolean language sql security definer set search_path = public stable as $$
  select coalesce((select value = 'true' from public.app_config
                   where key = 'pretournament_manual_lock'), false);
$$;

create or replace function public.admin_set_pretournament_lock(p_locked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  insert into public.app_config (key, value)
  values ('pretournament_manual_lock', case when p_locked then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
end; $$;

-- 2) New tables.
create table if not exists public.bracket_picks (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references public.leagues(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  match_id          integer not null references public.matches(id) on delete cascade,
  advancing_team_id integer not null references public.teams(id),
  unique (league_id, user_id, match_id)
);
create table if not exists public.third_slot_picks (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  slot_match_id integer not null references public.matches(id) on delete cascade,
  team_id       integer not null references public.teams(id),
  unique (league_id, user_id, slot_match_id)
);

alter table public.bracket_picks    enable row level security;
alter table public.third_slot_picks enable row level security;

drop policy if exists bp_read on public.bracket_picks;
create policy bp_read on public.bracket_picks
  for select to authenticated using (public.is_league_member(league_id));
drop policy if exists tsp_read on public.third_slot_picks;
create policy tsp_read on public.third_slot_picks
  for select to authenticated using (public.is_league_member(league_id));

revoke insert, update, delete on public.bracket_picks    from anon, authenticated;
revoke insert, update, delete on public.third_slot_picks from anon, authenticated;

-- 3) Write RPCs (sole write path; enforce the pre-tournament lock server-side).
-- p_advancing_team_id = null CLEARS the pick (used by the cascade).
create or replace function public.save_bracket_pick(
  p_league_id uuid, p_match_id integer, p_advancing_team_id integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_league_member(p_league_id) then raise exception 'Not a member of this league'; end if;
  if public.pretournament_locked() then raise exception 'Bracket is locked'; end if;
  if p_advancing_team_id is null then
    delete from public.bracket_picks
     where league_id = p_league_id and user_id = auth.uid() and match_id = p_match_id;
  else
    insert into public.bracket_picks (league_id, user_id, match_id, advancing_team_id)
    values (p_league_id, auth.uid(), p_match_id, p_advancing_team_id)
    on conflict (league_id, user_id, match_id) do update set advancing_team_id = excluded.advancing_team_id;
  end if;
end; $$;

create or replace function public.save_third_slot(
  p_league_id uuid, p_slot_match_id integer, p_team_id integer
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_league_member(p_league_id) then raise exception 'Not a member of this league'; end if;
  if public.pretournament_locked() then raise exception 'Bracket is locked'; end if;
  if p_team_id is null then
    delete from public.third_slot_picks
     where league_id = p_league_id and user_id = auth.uid() and slot_match_id = p_slot_match_id;
  else
    insert into public.third_slot_picks (league_id, user_id, slot_match_id, team_id)
    values (p_league_id, auth.uid(), p_slot_match_id, p_team_id)
    on conflict (league_id, user_id, slot_match_id) do update set team_id = excluded.team_id;
  end if;
end; $$;

-- 4) Grants.
grant execute on function public.save_bracket_pick(uuid,integer,integer)   to authenticated;
grant execute on function public.save_third_slot(uuid,integer,integer)     to authenticated;
grant execute on function public.admin_set_pretournament_lock(boolean)     to authenticated;

-- 5) Ensure the lock flag exists (default unlocked).
insert into public.app_config (key, value) values ('pretournament_manual_lock', 'false')
on conflict (key) do nothing;
