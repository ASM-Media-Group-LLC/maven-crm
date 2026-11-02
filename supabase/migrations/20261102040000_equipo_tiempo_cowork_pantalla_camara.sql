-- Sumar seg_sin_pantalla y seg_sin_camara al agregado del equipo, para que la
-- nota diaria v2 (pantalla 30 / cámara 30 / atención 30 / horas 10) pueda medir
-- pantalla% y cámara% en el ranking, igual que en el expediente.
drop function if exists public.equipo_tiempo_cowork(date, date);
create function public.equipo_tiempo_cowork(_desde date, _hasta date)
returns table(user_id uuid, seg_activo bigint, seg_meet bigint, seg_en_sala bigint, seg_sin_pantalla bigint, seg_sin_camara bigint, dias_con_reloj integer)
language sql stable security definer set search_path to 'public'
as $function$
  select c.user_id,
         sum(c.seg_activo)::bigint as seg_activo,
         sum(c.seg_meet)::bigint as seg_meet,
         sum(c.seg_en_sala)::bigint as seg_en_sala,
         sum(c.seg_sin_pantalla)::bigint as seg_sin_pantalla,
         sum(c.seg_sin_camara)::bigint as seg_sin_camara,
         count(*) filter (where c.seg_activo > 0)::integer as dias_con_reloj
  from public.cowork_tiempo_diario(_desde, _hasta, null, 500, 0) c
  where public.is_in_role_group(auth.uid(), 'supervisor_or_above') or c.user_id = auth.uid()
  group by c.user_id
$function$;
