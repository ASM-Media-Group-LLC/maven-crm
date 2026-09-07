-- El reloj de Cowork de TODO el equipo de chatters, para el tablero de equipo
-- (reemplazo de Hubstaff, fase 4). Mismo permiso que chatter_dashboard_periodo:
-- supervisor o superior ve a todos; cualquier otro, solo lo suyo.
create or replace function public.equipo_tiempo_cowork(_desde date, _hasta date)
returns table (
  user_id uuid,
  seg_activo bigint,
  seg_en_sala bigint,
  dias_con_reloj integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.user_id,
         sum(c.seg_activo)::bigint as seg_activo,
         sum(c.seg_en_sala)::bigint as seg_en_sala,
         count(*) filter (where c.seg_activo > 0)::integer as dias_con_reloj
  from public.cowork_tiempo_diario(_desde, _hasta, null, 500, 0) c
  where public.is_in_role_group(auth.uid(), 'supervisor_or_above') or c.user_id = auth.uid()
  group by c.user_id
$$;
revoke all on function public.equipo_tiempo_cowork(date, date) from public, anon;
grant execute on function public.equipo_tiempo_cowork(date, date) to authenticated;
