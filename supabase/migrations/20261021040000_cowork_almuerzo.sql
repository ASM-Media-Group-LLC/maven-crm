-- Almuerzo como TIPO de pausa aparte (antes el almuerzo se marcaba como break).
-- Álvaro pidió "Baño, Break y Almuerzo separados": el almuerzo tiene su propio
-- botón, su propio tope y su propia cuenta, para que no se mezcle con el break.

-- 1) Permitir 'almuerzo' en las dos tablas que limitan el tipo por CHECK.
alter table public.cowork_breaks drop constraint cowork_breaks_kind_chk;
alter table public.cowork_breaks
  add constraint cowork_breaks_kind_chk check (kind in ('bano', 'break', 'almuerzo'));

alter table public.cowork_break_limits drop constraint cowork_break_limits_kind_check;
alter table public.cowork_break_limits
  add constraint cowork_break_limits_kind_check check (kind in ('bano', 'break', 'almuerzo'));

-- 2) Tope por agencia: 60 min de almuerzo por defecto para TODA agencia que ya
--    tenga topes. Las agencias nuevas lo heredan por sembrar_cowork_de_agencia
--    (copia todas las filas de la agencia modelo). Un admin puede cambiarlo.
insert into public.cowork_break_limits (tenant_id, kind, label, minutos)
select distinct tenant_id, 'almuerzo', 'Almuerzo', 60
from public.cowork_break_limits
on conflict (tenant_id, kind) do nothing;

-- 3) El resumen del supervisor cuenta el almuerzo APARTE (antes, al no existir,
--    un almuerzo largo caía en "break" o no se contaba). Se AGREGAN columnas;
--    baño y break quedan EXACTAMENTE igual. El almuerzo se cuenta por pausa,
--    como el break (tope por vez), no como presupuesto del día.
--    (DROP + CREATE porque se le agregan columnas al tipo de retorno y
--    CREATE OR REPLACE no permite cambiar la forma de la tabla devuelta.)
DROP FUNCTION IF EXISTS public.cowork_pausas_resumen(date, date, uuid, uuid, integer, integer);
CREATE OR REPLACE FUNCTION public.cowork_pausas_resumen(_desde date DEFAULT NULL::date, _hasta date DEFAULT NULL::date, _session_id uuid DEFAULT NULL::uuid, _user_id uuid DEFAULT NULL::uuid, _limit integer DEFAULT 500, _offset integer DEFAULT 0)
 RETURNS TABLE(dia date, user_id uuid, nombre text, banos integer, seg_bano integer, bano_limite_seg integer, bano_excedido boolean, breaks integer, seg_break integer, break_limite_seg integer, breaks_excedidos integer, seg_break_de_mas integer, auto_cerradas integer, almuerzos integer, seg_almuerzo integer, almuerzo_limite_seg integer, almuerzos_excedidos integer, seg_almuerzo_de_mas integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with pausas as (
    select
      b.user_id,
      (b.started_at at time zone 'America/Bogota')::date as dia,
      b.kind,
      b.auto_closed,
      coalesce(b.duration_seconds, greatest(0, extract(epoch from (b.ended_at - b.started_at))::int)) as seg,
      coalesce(
        nullif(cs.alert_rules->'pausas'->>(case when b.kind = 'break' then 'breakMin' when b.kind = 'almuerzo' then 'almuerzoMin' else 'banoMin' end), '')::int,
        l.minutos
      ) * 60 as limite_seg
    from public.cowork_breaks b
    left join public.cowork_sessions cs on cs.id = b.session_id
    -- El tope es el de la agencia de la sesión (20261001213000).
    left join public.cowork_break_limits l on l.kind = b.kind and l.tenant_id = cs.tenant_id
    where b.ended_at is not null
      and (_desde is null or (b.started_at at time zone 'America/Bogota')::date >= _desde)
      and (_hasta is null or (b.started_at at time zone 'America/Bogota')::date <= _hasta)
      and (_session_id is null or b.session_id = _session_id)
      and (_user_id is null or b.user_id = _user_id)
      and (
        auth.uid() is null
        or b.user_id = auth.uid()
        or public.is_cowork_host(auth.uid(), b.session_id)
        or (public.is_in_role_group(auth.uid(), 'supervisor_or_above')
            and cs.tenant_id = (select public.current_tenant_id()))
      )
  ),
  sumas as (
    select
      p.dia, p.user_id,
      count(*) filter (where p.kind = 'bano' and not p.auto_closed)::int as banos,
      coalesce(sum(p.seg) filter (where p.kind = 'bano' and not p.auto_closed), 0)::int as seg_bano,
      max(p.limite_seg) filter (where p.kind = 'bano') as bano_limite_seg,
      count(*) filter (where p.kind = 'break' and not p.auto_closed)::int as breaks,
      coalesce(sum(p.seg) filter (where p.kind = 'break' and not p.auto_closed), 0)::int as seg_break,
      max(p.limite_seg) filter (where p.kind = 'break') as break_limite_seg,
      count(*) filter (where p.kind = 'break' and not p.auto_closed and p.limite_seg is not null and p.seg > p.limite_seg)::int as breaks_excedidos,
      coalesce(sum(greatest(0, p.seg - p.limite_seg)) filter (where p.kind = 'break' and not p.auto_closed and p.limite_seg is not null), 0)::int as seg_break_de_mas,
      count(*) filter (where p.auto_closed)::int as auto_cerradas,
      count(*) filter (where p.kind = 'almuerzo' and not p.auto_closed)::int as almuerzos,
      coalesce(sum(p.seg) filter (where p.kind = 'almuerzo' and not p.auto_closed), 0)::int as seg_almuerzo,
      max(p.limite_seg) filter (where p.kind = 'almuerzo') as almuerzo_limite_seg,
      count(*) filter (where p.kind = 'almuerzo' and not p.auto_closed and p.limite_seg is not null and p.seg > p.limite_seg)::int as almuerzos_excedidos,
      coalesce(sum(greatest(0, p.seg - p.limite_seg)) filter (where p.kind = 'almuerzo' and not p.auto_closed and p.limite_seg is not null), 0)::int as seg_almuerzo_de_mas
    from pausas p
    group by p.dia, p.user_id
  )
  select
    su.dia, su.user_id, pr.full_name as nombre,
    su.banos, su.seg_bano, su.bano_limite_seg,
    (su.bano_limite_seg is not null and su.seg_bano > su.bano_limite_seg) as bano_excedido,
    su.breaks, su.seg_break, su.break_limite_seg, su.breaks_excedidos, su.seg_break_de_mas,
    su.auto_cerradas,
    su.almuerzos, su.seg_almuerzo, su.almuerzo_limite_seg, su.almuerzos_excedidos, su.seg_almuerzo_de_mas
  from sumas su
  left join public.profiles pr on pr.id = su.user_id
  order by su.dia desc, pr.full_name
  limit least(greatest(_limit, 1), 2000)
  offset greatest(_offset, 0)
$function$;
