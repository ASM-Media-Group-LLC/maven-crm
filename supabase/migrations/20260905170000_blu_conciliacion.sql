-- CONCILIACIÓN MAVEN ↔ BLU. El objetivo (Jhon) es que el número de creadoras
-- coincida exacto entre las dos, y hoy no coincide por tres motivos distintos
-- que se arreglan en lugares distintos. Antes esto solo se veía corriendo SQL a
-- mano; ahora vive en Promolog → Vincular BLU, arriba de la tabla.
--
--  A) cuentas de BLU con plata que no están vinculadas a ninguna creadora
--     (esa plata no entra en NADA que filtre por creadora, empezando por el KPI
--     "Ingresos de tus modelos" del tablero del manager);
--  B) creadoras que facturan en BLU pero en Maven NO están `active`
--     (leaving / pendiente / onboarding / borrador: el estado quedó viejo);
--  C) creadoras `active` en Maven sin un peso en BLU en la ventana.
--
-- SE CUENTAN CREADORAS, NO CUENTAS: "así tenga dos cuentas en blu cuenta como
-- una sola creadora en maven". Las vinculadas ya se contaban bien (distinct
-- creator_id), pero las sueltas se listaban una por una y ahí `alissblondvip` +
-- `alissblondfree` parecían dos creadoras faltantes cuando son una.
--
-- `blu_normalize` no las junta porque solo saca vip/free cuando es palabra
-- aparte ("Vanity VIP" sí, "alissblondvip" no). `blu_persona_key` saca además
-- un sufijo PEGADO (of|tv|vip|free|ok|mx|xxx) cuando lo que queda tiene 5+
-- caracteres. Probado sobre las 89 cuentas del histórico: agrupa
-- alissblondfree+alissblondvip, ana.devin.tv+anadevinvip,
-- danikmichellof+danikmichelltv y sassyandrea+"sassyandrea free", y no fusiona
-- a nadie que no deba.
--
-- OJO: es una SUGERENCIA para contar y agrupar la lista, NUNCA para vincular
-- sola. Dos cuentas sin raíz común (Milionlyvip = immili + milionlyvip) solo se
-- atan con el `creator_id`, que es la única fuente de verdad.
create or replace function public.blu_persona_key(p text)
returns text
language sql
immutable
as $function$
  select case
           when length(regexp_replace(public.blu_normalize(p), '(of|tv|vip|free|ok|mx|xxx)$', '')) >= 5
             then regexp_replace(public.blu_normalize(p), '(of|tv|vip|free|ok|mx|xxx)$', '')
           else public.blu_normalize(p)
         end;
$function$;

create or replace function public.blu_conciliacion(p_dias int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_desde date := (current_date - greatest(1, least(p_dias, 400)));
  v_a jsonb; v_b jsonb; v_c jsonb;
  v_cuentas int; v_vinculadas int; v_creadoras_blu int; v_personas_sueltas int;
  v_activas int; v_plus int; v_massive int;
begin
  if not coalesce(public.blu_is_management(auth.uid()), false) then
    raise exception 'forbidden: management only' using errcode = '42501';
  end if;

  -- A) sin vincular, UNA FILA POR PERSONA (sus cuentas juntas)
  select coalesce(jsonb_agg(t order by t.bruto desc), '[]'::jsonb) into v_a
  from (
    select string_agg(distinct e.blu_creator_name, ' + ') as cuenta,
           count(distinct lower(trim(e.blu_creator_name))) as n_cuentas,
           round(sum(e.total_gross)) as bruto,
           count(distinct e.date) as dias,
           max(e.date)::text as ultimo_dia
    from public.creator_daily_earnings e
    where e.creator_id is null and e.date >= v_desde
      and not exists (
        select 1 from public.blu_creator_map m
        where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored')
    group by public.blu_persona_key(e.blu_creator_name)
    having sum(e.total_gross) > 0
  ) t;
  v_personas_sueltas := jsonb_array_length(v_a);

  -- B) factura en BLU pero no está activa en Maven
  select coalesce(jsonb_agg(t order by t.bruto desc), '[]'::jsonb) into v_b
  from (
    select coalesce(nullif(trim(c.artistic_name),''), c.name) as creadora,
           c.status, coalesce(cb.kash_type,'—') as kash,
           string_agg(distinct e.blu_creator_name, ' + ') as cuentas,
           round(sum(e.total_gross)) as bruto,
           max(e.date)::text as ultimo_dia
    from public.creator_daily_earnings e
    join public.creators c on c.id = e.creator_id
    left join public.creator_business cb on cb.creator_id = c.id
    where e.date >= v_desde and c.status <> 'active'
    group by c.id, c.artistic_name, c.name, c.status, cb.kash_type
    having sum(e.total_gross) > 0
  ) t;

  -- C) activa en Maven, sin datos en BLU
  select coalesce(jsonb_agg(t order by t.creadora), '[]'::jsonb) into v_c
  from (
    select coalesce(nullif(trim(c.artistic_name),''), c.name) as creadora,
           coalesce(cb.kash_type,'—') as kash
    from public.creators c
    left join public.creator_business cb on cb.creator_id = c.id
    where c.status = 'active'
      and not exists (select 1 from public.creator_daily_earnings e
                       where e.creator_id = c.id and e.date >= v_desde)
  ) t;

  -- Cuentas y creadoras: una creadora con dos cuentas cuenta UNA VEZ.
  select count(*), count(*) filter (where cid is not null), count(distinct cid)
    into v_cuentas, v_vinculadas, v_creadoras_blu
  from (
    select max(e.creator_id::text) as cid
    from public.creator_daily_earnings e
    where e.date >= v_desde
      and not exists (
        select 1 from public.blu_creator_map m
        where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored')
    group by lower(trim(e.blu_creator_name))
  ) x;

  select count(*),
         count(*) filter (where cb.kash_type = 'Plus'),
         count(*) filter (where cb.kash_type = 'Massive')
    into v_activas, v_plus, v_massive
  from public.creators c
  left join public.creator_business cb on cb.creator_id = c.id
  where c.status = 'active';

  return jsonb_build_object(
    'desde', v_desde,
    'blu_cuentas', v_cuentas,
    'blu_cuentas_vinculadas', v_vinculadas,
    'blu_creadoras', v_creadoras_blu,
    'blu_personas_sin_vincular', v_personas_sueltas,
    'maven_activas', v_activas,
    'maven_plus', v_plus,
    'maven_massive', v_massive,
    'cuadra', (v_creadoras_blu = v_activas and v_personas_sueltas = 0
               and jsonb_array_length(v_b) = 0 and jsonb_array_length(v_c) = 0),
    'sin_vincular', v_a,
    'facturan_sin_estar_activas', v_b,
    'activas_sin_blu', v_c);
end;
$function$;

revoke all on function public.blu_conciliacion(int) from public;
grant execute on function public.blu_conciliacion(int) to authenticated;

-- ── Versión final (aplicada en prod): la lista de sueltas trae también la
--    AGENCIA de cada cuenta, que viene de `blu_account_agency` (migración
--    20260905180000). Con eso "¿es nuestra?" deja de ser una adivinanza.
