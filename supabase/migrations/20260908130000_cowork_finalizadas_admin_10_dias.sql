-- "Finalizadas recientemente" de Cowork:
--   · ventana de 10 días (pedido de Jhon, 08/09): lo más viejo se va solo;
--   · los ADMINS ven TODAS las finalizadas de la empresa, no solo las sesiones
--     donde eran miembros (Grace no veía nada; Jhon no veía MASIVOS PPV);
--   · los demás siguen viendo las sesiones donde estuvieron;
--   · con nombre de quien la creó, para saber de quién era.
-- Cambia el tipo de retorno (columna nueva created_by_name): hay que soltarla antes.
drop function if exists public.cowork_mis_sesiones_finalizadas(integer);
create or replace function public.cowork_mis_sesiones_finalizadas(_dias integer default 10)
returns table (
  id uuid, name text, ended_at timestamptz, ended_by uuid, ended_by_name text,
  created_by uuid, created_by_name text, members integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id, s.name, s.ended_at, s.ended_by,
    pe.full_name as ended_by_name,
    s.created_by,
    pc.full_name as created_by_name,
    (select count(*)::integer from public.cowork_memberships t where t.session_id = s.id) as members
  from public.cowork_sessions s
  left join public.profiles pe on pe.id = s.ended_by
  left join public.profiles pc on pc.id = s.created_by
  where s.status = 'ended'
    and s.ended_at > now() - make_interval(days => greatest(1, least(coalesce(_dias, 10), 90)))
    and (
      public.has_role(auth.uid(), 'admin'::app_role)
      or exists (select 1 from public.cowork_memberships m where m.session_id = s.id and m.user_id = auth.uid())
    )
  order by s.ended_at desc
  limit 30;
$$;
revoke all on function public.cowork_mis_sesiones_finalizadas(integer) from public, anon;
grant execute on function public.cowork_mis_sesiones_finalizadas(integer) to authenticated;
