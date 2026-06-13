-- ============================================================================
-- MIGRATION — allow save_bracket_pick to CLEAR a pick (pass null team).
-- Needed for the bracket's auto-cascade (clearing downstream picks that become
-- invalid after an upstream change).
--
-- Run once in the Supabase SQL editor. Idempotent (create or replace).
-- Requires the bracket_picks table to already exist (from migration_bracket.sql).
-- ============================================================================

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

grant execute on function public.save_bracket_pick(uuid,integer,integer) to authenticated;
