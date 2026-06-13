-- ============================================================================
-- MIGRATION — Admin powers: cross-league visibility + member/account management.
-- Run once in the Supabase SQL editor. Idempotent.
--
-- The single admin (is_admin(), matched by app_config.admin_email) gets a
-- deliberate, admin-only exception to league isolation: read access to ALL
-- leagues + management RPCs. Players remain isolated from each other.
-- ============================================================================

-- ---- Cross-league READ for the admin (add `or is_admin()` to read policies) --
drop policy if exists leagues_member_read on public.leagues;
create policy leagues_member_read on public.leagues
  for select to authenticated
  using (owner_id = auth.uid() or public.is_league_member(id) or public.is_admin());

drop policy if exists members_read on public.league_members;
create policy members_read on public.league_members
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

drop policy if exists predictions_read on public.predictions;
create policy predictions_read on public.predictions
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

drop policy if exists gpp_read on public.group_position_picks;
create policy gpp_read on public.group_position_picks
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

drop policy if exists kp_read on public.knockout_picks;
create policy kp_read on public.knockout_picks
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

drop policy if exists cp_read on public.champion_picks;
create policy cp_read on public.champion_picks
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

drop policy if exists bp_read on public.bracket_picks;
create policy bp_read on public.bracket_picks
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

drop policy if exists tsp_read on public.third_slot_picks;
create policy tsp_read on public.third_slot_picks
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_admin());

-- Admin may read every profile (to manage members/accounts by name/email).
drop policy if exists profiles_admin_read on public.profiles;
create policy profiles_admin_read on public.profiles
  for select to authenticated using (public.is_admin());

-- ============================================================================
-- ADMIN MANAGEMENT RPCs (SECURITY DEFINER; bypass RLS, gated on is_admin()).
-- ============================================================================

-- Add an EXISTING account (by email) to a league.
create or replace function public.admin_add_member(p_league_id uuid, p_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  select id into v_uid from public.profiles where lower(email) = lower(trim(p_email));
  if v_uid is null then
    raise exception 'No account with email %, ask them to sign up first', p_email;
  end if;
  insert into public.league_members (league_id, user_id) values (p_league_id, v_uid)
  on conflict do nothing;
  return v_uid;
end; $$;

-- Remove a player from ONE league + purge their picks for that league only.
create or replace function public.admin_remove_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
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

-- Soft-remove an account: purge ALL their picks and remove them from ALL
-- leagues. The login (auth.users) is NOT deleted (that needs the service role /
-- Supabase dashboard). Leagues they OWN are left intact.
create or replace function public.admin_soft_remove_account(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
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

grant execute on function public.admin_add_member(uuid,text)        to authenticated;
grant execute on function public.admin_remove_member(uuid,uuid)     to authenticated;
grant execute on function public.admin_soft_remove_account(uuid)    to authenticated;
grant execute on function public.admin_rename_league(uuid,text)     to authenticated;
