-- ============================================================================
-- FIFA World Cup 2026 Predictor — Database schema
-- Run this FIRST in the Supabase SQL editor, then run seed.sql.
--
-- Design (see README):
--   * GLOBAL reference layer  : teams, groups, matches  (one shared copy;
--     readable by all authenticated users, writable only by the admin).
--   * LEAGUE-ISOLATED layer    : leagues, league_members, predictions,
--     group_position_picks, knockout_picks, champion_picks
--     (RLS so a row is visible only to members of its league).
--   * Predictions/picks are NEVER written directly by clients. The ONLY write
--     path is a set of SECURITY DEFINER RPCs that enforce the kickoff/manual
--     lock using SERVER time. Direct INSERT/UPDATE is revoked.
-- ============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists pgcrypto;     -- gen_random_uuid(), crypt()

-- ============================================================================
-- CONFIG (server-side admin identity; NOT league data)
-- ============================================================================
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
-- Seeded in seed.sql: ('admin_email', '<your admin email>').

-- ============================================================================
-- GLOBAL REFERENCE TABLES
-- ============================================================================
create table if not exists public.groups (
  letter text primary key check (char_length(letter) = 1)
);

create table if not exists public.teams (
  id            integer primary key,
  name          text not null,
  code          text,                 -- short code e.g. MEX
  flag_code     text not null,        -- flagcdn ISO, incl. gb-eng / gb-sct
  group_letter  text references public.groups(letter),
  fifa_ranking  integer               -- NULL = treated as worst in tiebreaks
);

-- stage: group | r32 | r16 | qf | sf | third_place | final
create table if not exists public.matches (
  id                    integer primary key,   -- == match_no from the feed
  match_no              integer not null unique,
  stage                 text not null,
  round                 text,                  -- e.g. "Matchday 1", "Round of 32"
  group_letter          text references public.groups(letter),
  home_team_id          integer references public.teams(id),
  away_team_id          integer references public.teams(id),
  home_placeholder      text,                  -- e.g. 1E / 2A / 3A/B/C/D/F / W74 / L101
  away_placeholder      text,
  kickoff_utc           timestamptz not null,
  venue                 text,
  manual_lock           boolean not null default false,
  home_score            integer,
  away_score            integer,
  home_cards            integer not null default 0,  -- disciplinary pts (fair-play tiebreak)
  away_cards            integer not null default 0,
  advancing_team_id     integer references public.teams(id), -- KO: who advanced (pens/ET)
  is_third_place_playoff boolean not null default false,     -- non-scoring
  status                text not null default 'scheduled'    -- scheduled|finished
);

create index if not exists matches_stage_idx on public.matches(stage);
create index if not exists matches_group_idx on public.matches(group_letter);

-- ============================================================================
-- AUTH-LINKED PROFILE
-- ============================================================================
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text
);

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- LEAGUE-ISOLATED TABLES
-- ============================================================================
create table if not exists public.leagues (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

create table if not exists public.predictions (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  match_id   integer not null references public.matches(id) on delete cascade,
  home_pred  integer not null check (home_pred >= 0),
  away_pred  integer not null check (away_pred >= 0),
  advancing_team_id integer references public.teams(id), -- KO draw: who the player thinks wins on pens/ET
  updated_at timestamptz not null default now(),
  unique (league_id, user_id, match_id)
);
-- For DBs created before advancing_team_id existed.
alter table public.predictions add column if not exists advancing_team_id integer references public.teams(id);

create table if not exists public.group_position_picks (
  id                 uuid primary key default gen_random_uuid(),
  league_id          uuid not null references public.leagues(id) on delete cascade,
  user_id            uuid not null references auth.users(id) on delete cascade,
  group_letter       text not null references public.groups(letter),
  team_id            integer not null references public.teams(id),
  predicted_position integer not null check (predicted_position between 1 and 4),
  unique (league_id, user_id, group_letter, predicted_position)
);

-- round: r32 | r16 | qf | sf | final  (display-only reach picks)
create table if not exists public.knockout_picks (
  id        uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  round     text not null,
  team_id   integer not null references public.teams(id),
  unique (league_id, user_id, round, team_id)
);

create table if not exists public.champion_picks (
  id        uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  team_id   integer not null references public.teams(id),
  unique (league_id, user_id)
);

-- Connected pre-tournament bracket. For each knockout match (M73..M104, except
-- the non-scoring third-place playoff), the user predicts the advancing team.
create table if not exists public.bracket_picks (
  id                uuid primary key default gen_random_uuid(),
  league_id         uuid not null references public.leagues(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  match_id          integer not null references public.matches(id) on delete cascade,
  advancing_team_id integer not null references public.teams(id),
  unique (league_id, user_id, match_id)
);

-- Which qualified third-placed team the user assigns to each R32 third-place
-- slot (one row per third-place slot match). The set of team_ids = the user's
-- predicted 8 best thirds.
create table if not exists public.third_slot_picks (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  slot_match_id integer not null references public.matches(id) on delete cascade,
  team_id       integer not null references public.teams(id),
  unique (league_id, user_id, slot_match_id)
);

-- ============================================================================
-- SECURITY HELPERS (SECURITY DEFINER so they bypass RLS internally)
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_config c
    where c.key = 'admin_email'
      and lower(c.value) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
  );
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.app_config            enable row level security;
alter table public.groups                enable row level security;
alter table public.teams                 enable row level security;
alter table public.matches               enable row level security;
alter table public.profiles              enable row level security;
alter table public.leagues               enable row level security;
alter table public.league_members        enable row level security;
alter table public.predictions           enable row level security;
alter table public.group_position_picks  enable row level security;
alter table public.knockout_picks        enable row level security;
alter table public.champion_picks        enable row level security;
alter table public.bracket_picks         enable row level security;
alter table public.third_slot_picks      enable row level security;

-- ---- Global reference: readable by all authenticated; admin-only writes ----
create policy app_config_read on public.app_config
  for select to authenticated using (true);

create policy groups_read on public.groups
  for select to authenticated using (true);

create policy teams_read on public.teams
  for select to authenticated using (true);
create policy teams_admin_write on public.teams
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy matches_read on public.matches
  for select to authenticated using (true);
create policy matches_admin_write on public.matches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- Profiles: a user sees their own + co-members in shared leagues --------
create policy profiles_self on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_comember on public.profiles
  for select to authenticated using (
    exists (
      select 1 from public.league_members me
      join public.league_members them on them.league_id = me.league_id
      where me.user_id = auth.uid() and them.user_id = public.profiles.id
    )
  );
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_read on public.profiles
  for select to authenticated using (public.is_admin());

-- ---- Leagues: members can see their league; anyone authenticated may look up
-- a league by invite_code in order to join (handled via join_league RPC, but a
-- read policy is needed for the owner/members to load it). --------------------
create policy leagues_member_read on public.leagues
  for select to authenticated using (
    owner_id = auth.uid() or public.is_league_member(id) or public.is_admin()
  );
create policy leagues_owner_insert on public.leagues
  for insert to authenticated with check (owner_id = auth.uid());
create policy leagues_owner_manage on public.leagues
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy leagues_owner_delete on public.leagues
  for delete to authenticated using (owner_id = auth.uid());

-- ---- League members: visible only to members of the same league -----------
create policy members_read on public.league_members
  for select to authenticated using (public.is_league_member(league_id) or public.is_admin());
-- Self-join: a user may insert their OWN membership row (join_league RPC also
-- validates the invite code; this policy keeps the write self-scoped).
create policy members_self_insert on public.league_members
  for insert to authenticated with check (user_id = auth.uid());
create policy members_self_delete on public.league_members
  for delete to authenticated using (user_id = auth.uid());

-- ---- Predictions & picks: SELECT scoped to league members; NO direct writes.
-- Writes happen ONLY through the SECURITY DEFINER RPCs below. We deliberately
-- create NO insert/update policies, AND revoke table privileges, so the RPC is
-- the sole write path (harder to bypass than a time-based RLS policy).
create policy predictions_read on public.predictions
  for select to authenticated using (public.is_league_member(league_id) or public.is_admin());

create policy gpp_read on public.group_position_picks
  for select to authenticated using (public.is_league_member(league_id) or public.is_admin());

create policy kp_read on public.knockout_picks
  for select to authenticated using (public.is_league_member(league_id) or public.is_admin());

create policy cp_read on public.champion_picks
  for select to authenticated using (public.is_league_member(league_id) or public.is_admin());

create policy bp_read on public.bracket_picks
  for select to authenticated using (public.is_league_member(league_id) or public.is_admin());

create policy tsp_read on public.third_slot_picks
  for select to authenticated using (public.is_league_member(league_id) or public.is_admin());

-- Revoke any direct write privilege on the prediction/pick tables.
revoke insert, update, delete on public.predictions          from anon, authenticated;
revoke insert, update, delete on public.group_position_picks from anon, authenticated;
revoke insert, update, delete on public.knockout_picks       from anon, authenticated;
revoke insert, update, delete on public.champion_picks       from anon, authenticated;
revoke insert, update, delete on public.bracket_picks        from anon, authenticated;
revoke insert, update, delete on public.third_slot_picks     from anon, authenticated;

-- ============================================================================
-- LOCK HELPERS
-- ============================================================================
-- First group kickoff (kept for reference / display).
create or replace function public.first_group_kickoff()
returns timestamptz
language sql
security definer set search_path = public
stable
as $$
  select min(kickoff_utc) from public.matches where stage = 'group';
$$;

-- Pre-tournament lock is ADMIN-CONTROLLED (a flag in app_config), independent
-- of the calendar — the admin can lock/unlock the bracket at any time. Defaults
-- to UNLOCKED so players can fill the bracket. (Per-match score predictions
-- still lock by their own kickoff_utc; only the pre-tournament bracket uses this.)
create or replace function public.pretournament_locked()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce(
           (select value = 'true' from public.app_config where key = 'pretournament_manual_lock'),
           false);
$$;

create or replace function public.admin_set_pretournament_lock(p_locked boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  insert into public.app_config (key, value)
  values ('pretournament_manual_lock', case when p_locked then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
end;
$$;

-- Whether advance/third/reach points count toward each player's TOTAL.
-- Off until the admin enables it (e.g. after the tournament). The points are
-- always computed and shown; this only controls whether they're summed in.
create or replace function public.admin_set_accumulate_advance(p_on boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  insert into public.app_config (key, value)
  values ('accumulate_advance', case when p_on then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
end;
$$;

-- ============================================================================
-- WRITE RPCs (the ONLY way clients write predictions / picks)
-- ============================================================================
-- Drop the old 4-arg signature so the advancer-aware version below is unambiguous.
drop function if exists public.save_prediction(uuid, integer, integer, integer);
create or replace function public.save_prediction(
  p_league_id uuid, p_match_id integer, p_home integer, p_away integer,
  p_advancing integer default null
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_locked boolean;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member of this league';
  end if;
  if p_home < 0 or p_away < 0 then
    raise exception 'Scores must be >= 0';
  end if;

  select (m.manual_lock or now() >= m.kickoff_utc)
    into v_locked
  from public.matches m
  where m.id = p_match_id;

  if v_locked is null then
    raise exception 'Unknown match';
  end if;
  if v_locked then
    raise exception 'Prediction locked for this match';
  end if;

  -- Only a drawn KO prediction carries an advancer; otherwise store null.
  insert into public.predictions (league_id, user_id, match_id, home_pred, away_pred, advancing_team_id, updated_at)
  values (p_league_id, auth.uid(), p_match_id, p_home, p_away,
          case when p_home = p_away then p_advancing else null end, now())
  on conflict (league_id, user_id, match_id)
  do update set home_pred = excluded.home_pred,
                away_pred = excluded.away_pred,
                advancing_team_id = excluded.advancing_team_id,
                updated_at = now();
end;
$$;

-- Replace this user's full 1..4 ordering for one group. picks = array of
-- team ids in finishing-position order [pos1, pos2, pos3, pos4].
create or replace function public.save_group_positions(
  p_league_id uuid, p_group text, p_team_ids integer[]
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  i integer;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member of this league';
  end if;
  if public.pretournament_locked() then
    raise exception 'Pre-tournament picks are locked';
  end if;
  if array_length(p_team_ids, 1) <> 4 then
    raise exception 'Provide exactly 4 teams in finishing order';
  end if;

  delete from public.group_position_picks
   where league_id = p_league_id and user_id = auth.uid() and group_letter = p_group;

  for i in 1..4 loop
    insert into public.group_position_picks
      (league_id, user_id, group_letter, team_id, predicted_position)
    values (p_league_id, auth.uid(), p_group, p_team_ids[i], i);
  end loop;
end;
$$;

-- Replace this user's reach picks for one round (display-only mechanic).
create or replace function public.save_knockout_picks(
  p_league_id uuid, p_round text, p_team_ids integer[]
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  t integer;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member of this league';
  end if;
  if public.pretournament_locked() then
    raise exception 'Pre-tournament picks are locked';
  end if;

  delete from public.knockout_picks
   where league_id = p_league_id and user_id = auth.uid() and round = p_round;

  if p_team_ids is not null then
    foreach t in array p_team_ids loop
      insert into public.knockout_picks (league_id, user_id, round, team_id)
      values (p_league_id, auth.uid(), p_round, t)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;

create or replace function public.save_champion_pick(
  p_league_id uuid, p_team_id integer
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member of this league';
  end if;
  if public.pretournament_locked() then
    raise exception 'Pre-tournament picks are locked';
  end if;

  insert into public.champion_picks (league_id, user_id, team_id)
  values (p_league_id, auth.uid(), p_team_id)
  on conflict (league_id, user_id)
  do update set team_id = excluded.team_id;
end;
$$;

-- Connected bracket: predict the advancing team for one knockout match.
-- Pass p_advancing_team_id = null to CLEAR the pick (used by the cascade that
-- removes downstream picks invalidated by an upstream change).
create or replace function public.save_bracket_pick(
  p_league_id uuid, p_match_id integer, p_advancing_team_id integer
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member of this league';
  end if;
  if public.pretournament_locked() then
    raise exception 'Bracket is locked';
  end if;
  if p_advancing_team_id is null then
    delete from public.bracket_picks
     where league_id = p_league_id and user_id = auth.uid() and match_id = p_match_id;
  else
    insert into public.bracket_picks (league_id, user_id, match_id, advancing_team_id)
    values (p_league_id, auth.uid(), p_match_id, p_advancing_team_id)
    on conflict (league_id, user_id, match_id)
    do update set advancing_team_id = excluded.advancing_team_id;
  end if;
end;
$$;

-- Assign a qualified third-placed team to one R32 third-place slot.
-- Pass p_team_id = null to clear the slot.
create or replace function public.save_third_slot(
  p_league_id uuid, p_slot_match_id integer, p_team_id integer
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member of this league';
  end if;
  if public.pretournament_locked() then
    raise exception 'Bracket is locked';
  end if;
  if p_team_id is null then
    delete from public.third_slot_picks
     where league_id = p_league_id and user_id = auth.uid() and slot_match_id = p_slot_match_id;
  else
    insert into public.third_slot_picks (league_id, user_id, slot_match_id, team_id)
    values (p_league_id, auth.uid(), p_slot_match_id, p_team_id)
    on conflict (league_id, user_id, slot_match_id)
    do update set team_id = excluded.team_id;
  end if;
end;
$$;

-- ---- Admin member/account management (gated on is_admin()) ----------------
create or replace function public.admin_add_member(p_league_id uuid, p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select id into v_uid from public.profiles where lower(email) = lower(trim(p_email));
  if v_uid is null then raise exception 'No account with email %, ask them to sign up first', p_email; end if;
  insert into public.league_members (league_id, user_id) values (p_league_id, v_uid) on conflict do nothing;
  return v_uid;
end; $$;

create or replace function public.admin_remove_member(p_league_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  delete from public.predictions          where league_id = p_league_id and user_id = p_user_id;
  delete from public.group_position_picks where league_id = p_league_id and user_id = p_user_id;
  delete from public.knockout_picks       where league_id = p_league_id and user_id = p_user_id;
  delete from public.champion_picks        where league_id = p_league_id and user_id = p_user_id;
  delete from public.bracket_picks         where league_id = p_league_id and user_id = p_user_id;
  delete from public.third_slot_picks      where league_id = p_league_id and user_id = p_user_id;
  delete from public.league_members        where league_id = p_league_id and user_id = p_user_id;
end; $$;

create or replace function public.admin_soft_remove_account(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  delete from public.predictions          where user_id = p_user_id;
  delete from public.group_position_picks where user_id = p_user_id;
  delete from public.knockout_picks       where user_id = p_user_id;
  delete from public.champion_picks        where user_id = p_user_id;
  delete from public.bracket_picks         where user_id = p_user_id;
  delete from public.third_slot_picks      where user_id = p_user_id;
  delete from public.league_members        where user_id = p_user_id;
end; $$;

create or replace function public.admin_rename_league(p_league_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Name required'; end if;
  update public.leagues set name = trim(p_name) where id = p_league_id;
end; $$;

-- Join a league by invite code (returns the league id).
create or replace function public.join_league(p_invite_code text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_league_id uuid;
begin
  select id into v_league_id from public.leagues
   where lower(invite_code) = lower(trim(p_invite_code));
  if v_league_id is null then
    raise exception 'No league with that invite code';
  end if;
  insert into public.league_members (league_id, user_id)
  values (v_league_id, auth.uid())
  on conflict do nothing;
  return v_league_id;
end;
$$;

-- ---- Admin result entry (authoritative). Bypasses RLS via definer + is_admin
create or replace function public.admin_save_result(
  p_match_id integer, p_home integer, p_away integer,
  p_advancing integer default null, p_status text default 'finished'
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  update public.matches
     set home_score = p_home,
         away_score = p_away,
         advancing_team_id = p_advancing,
         status = coalesce(p_status, 'finished')
   where id = p_match_id;
  if not found then
    raise exception 'Unknown match';
  end if;
end;
$$;

-- Admin: toggle a per-match manual lock.
create or replace function public.admin_set_match_lock(
  p_match_id integer, p_locked boolean
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  update public.matches set manual_lock = p_locked where id = p_match_id;
end;
$$;

-- Admin: lock/unlock an entire stage at once.
create or replace function public.admin_set_stage_lock(
  p_stage text, p_locked boolean
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  update public.matches set manual_lock = p_locked where stage = p_stage;
end;
$$;

-- Admin: resolve a knockout fixture's actual teams once known.
create or replace function public.admin_set_ko_teams(
  p_match_id integer, p_home_team integer, p_away_team integer
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin only';
  end if;
  update public.matches
     set home_team_id = p_home_team, away_team_id = p_away_team
   where id = p_match_id;
end;
$$;

-- Grant execute on the write RPCs.
grant execute on function public.save_prediction(uuid,integer,integer,integer,integer)  to authenticated;
grant execute on function public.save_group_positions(uuid,text,integer[])       to authenticated;
grant execute on function public.save_knockout_picks(uuid,text,integer[])        to authenticated;
grant execute on function public.save_champion_pick(uuid,integer)                to authenticated;
grant execute on function public.save_bracket_pick(uuid,integer,integer)         to authenticated;
grant execute on function public.save_third_slot(uuid,integer,integer)           to authenticated;
grant execute on function public.admin_set_pretournament_lock(boolean)           to authenticated;
grant execute on function public.admin_set_accumulate_advance(boolean)           to authenticated;
grant execute on function public.join_league(text)                              to authenticated;
grant execute on function public.admin_add_member(uuid,text)                    to authenticated;
grant execute on function public.admin_remove_member(uuid,uuid)                 to authenticated;
grant execute on function public.admin_soft_remove_account(uuid)                to authenticated;
grant execute on function public.admin_rename_league(uuid,text)                 to authenticated;
grant execute on function public.admin_save_result(integer,integer,integer,integer,text) to authenticated;
grant execute on function public.admin_set_match_lock(integer,boolean)          to authenticated;
grant execute on function public.admin_set_stage_lock(text,boolean)             to authenticated;
grant execute on function public.admin_set_ko_teams(integer,integer,integer)    to authenticated;
grant execute on function public.is_admin()                                     to authenticated;
grant execute on function public.is_league_member(uuid)                         to authenticated;
grant execute on function public.first_group_kickoff()                          to authenticated;
grant execute on function public.pretournament_locked()                         to authenticated;
