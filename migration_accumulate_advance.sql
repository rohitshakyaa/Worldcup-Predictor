-- ============================================================================
-- MIGRATION — advance/third/reach points are SHOWN but not added to totals
-- until the admin enables accumulation (e.g. after the World Cup).
-- Run once in the Supabase SQL editor. Idempotent.
-- ============================================================================

create or replace function public.admin_set_accumulate_advance(p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  insert into public.app_config (key, value)
  values ('accumulate_advance', case when p_on then 'true' else 'false' end)
  on conflict (key) do update set value = excluded.value;
end; $$;

grant execute on function public.admin_set_accumulate_advance(boolean) to authenticated;

-- Default flag (off) — only inserted if missing.
insert into public.app_config (key, value) values ('accumulate_advance', 'false')
on conflict (key) do nothing;
