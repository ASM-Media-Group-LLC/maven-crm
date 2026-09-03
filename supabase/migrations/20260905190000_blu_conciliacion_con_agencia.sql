-- La conciliación y la tabla de huérfanas muestran de qué AGENCIA vino cada
-- cuenta suelta (`blu_account_agency`, sellada por el token con que la trajo el
-- bridge — ver 20260905180000). Si dice plus o massive, la cuenta es NUESTRA y
-- lo único que falta es crear la creadora en Maven; si no dice nada, es una de
-- las que hay que decidir a mano.
--
-- `blu_list_orphans` se dropea primero porque cambia el tipo de retorno.
drop function if exists public.blu_list_orphans();

create function public.blu_list_orphans()
returns table(blu_name text, total_gross numeric, days integer, first_date date, last_date date, agency text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') = 'service_role') then
    raise exception 'forbidden: solo management' using errcode = '42501';
  end if;
  return query
    select min(e.blu_creator_name),
           sum(e.total_gross)::numeric,
           count(distinct e.date)::int,
           min(e.date),
           max(e.date),
           max(a.agency)
    from public.creator_daily_earnings e
    left join public.blu_account_agency a on a.cuenta = lower(trim(e.blu_creator_name))
    where e.creator_id is null
      and not exists (
        select 1 from public.blu_creator_map m
        where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored'
      )
    group by lower(trim(e.blu_creator_name))
    order by sum(e.total_gross) desc;
end;
$function$;

-- ── Definición FINAL de la conciliación ─────────────────────────────────────
-- El número de arriba tiene que ser TODAS las personas que facturaron en BLU,
-- no solo las vinculadas. Antes se contaban únicamente las que ya tenían perfil
-- en Maven (58), así que las 10 sueltas quedaban fuera del número y compararlo
-- contra "activas en Maven" (54) no significaba nada: daba una diferencia de 4
-- cuando la real es 14. Lo cachó Jhon: "no tiene sentido los números que me das".
--
-- Todo en PERSONAS (una creadora con dos cuentas cuenta una vez) y contando
-- solo a quien facturó > 0 en la ventana:
--   blu_personas     = blu_vinculadas + blu_sin_vincular   ← el número de arriba
--   blu_vinculadas   = tienen perfil en Maven (active o no)
--   blu_sin_vincular = les falta el perfil
--   maven_activas    = status = 'active'
-- Y la diferencia se descompone exacto, que es lo que la hace auditable:
--   blu_personas − maven_activas
--     = sin_vincular + (facturan con estado ≠ active) − (activas que no facturaron)
--   68 − 54 = 10 + 5 − 1 = 14 ✓
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
  v_cuentas int; v_cuentas_vinc int;
  v_vinculadas int; v_sueltas int; v_sueltas_nuestras int; v_personas int;
  v_activas int; v_plus int; v_massive int; v_estado_viejo int; v_sin_facturar int;
begin
  if not coalesce(public.blu_is_management(auth.uid()), false) then
    raise exception 'forbidden: management only' using errcode = '42501';
  end if;

  -- A) sueltas, UNA FILA POR PERSONA, con la agencia que la trajo
  select coalesce(jsonb_agg(t order by t.bruto desc), '[]'::jsonb) into v_a
  from (
    select string_agg(distinct e.blu_creator_name, ' + ') as cuenta,
           count(distinct lower(trim(e.blu_creator_name))) as n_cuentas,
           round(sum(e.total_gross)) as bruto,
           count(distinct e.date) as dias,
           max(e.date)::text as ultimo_dia,
           max(a.agency) as agencia
    from public.creator_daily_earnings e
    left join public.blu_account_agency a on a.cuenta = lower(trim(e.blu_creator_name))
    where e.creator_id is null and e.date >= v_desde
      and not exists (
        select 1 from public.blu_creator_map m
        where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored')
    group by public.blu_persona_key(e.blu_creator_name)
    having sum(e.total_gross) > 0
  ) t;
  v_sueltas := jsonb_array_length(v_a);
  select count(*) into v_sueltas_nuestras
  from jsonb_array_elements(v_a) x where x->>'agencia' is not null;

  -- B) facturan con estado != active (el perfil existe, pero no cuenta como roster)
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
  v_estado_viejo := jsonb_array_length(v_b);

  -- C) activas en Maven que no facturaron
  select coalesce(jsonb_agg(t order by t.creadora), '[]'::jsonb) into v_c
  from (
    select coalesce(nullif(trim(c.artistic_name),''), c.name) as creadora,
           coalesce(cb.kash_type,'—') as kash
    from public.creators c
    left join public.creator_business cb on cb.creator_id = c.id
    where c.status = 'active'
      and not exists (select 1 from public.creator_daily_earnings e
                       where e.creator_id = c.id and e.date >= v_desde
                         and e.total_gross > 0)
  ) t;
  v_sin_facturar := jsonb_array_length(v_c);

  select count(*), count(*) filter (where cid is not null),
         count(distinct cid) filter (where bruto > 0)
    into v_cuentas, v_cuentas_vinc, v_vinculadas
  from (
    select max(e.creator_id::text) as cid, sum(e.total_gross) as bruto
    from public.creator_daily_earnings e
    where e.date >= v_desde
      and not exists (
        select 1 from public.blu_creator_map m
        where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored')
    group by lower(trim(e.blu_creator_name))
  ) x;

  v_personas := v_vinculadas + v_sueltas;

  select count(*),
         count(*) filter (where cb.kash_type = 'Plus'),
         count(*) filter (where cb.kash_type = 'Massive')
    into v_activas, v_plus, v_massive
  from public.creators c
  left join public.creator_business cb on cb.creator_id = c.id
  where c.status = 'active';

  return jsonb_build_object(
    'desde', v_desde,
    'blu_personas', v_personas,
    'blu_vinculadas', v_vinculadas,
    'blu_sin_vincular', v_sueltas,
    'blu_sueltas_con_agencia', v_sueltas_nuestras,
    'blu_cuentas', v_cuentas,
    'blu_cuentas_vinculadas', v_cuentas_vinc,
    'maven_activas', v_activas,
    'maven_plus', v_plus,
    'maven_massive', v_massive,
    'estado_viejo', v_estado_viejo,
    'activas_sin_facturar', v_sin_facturar,
    'cuadra', (v_personas = v_activas and v_sueltas = 0
               and v_estado_viejo = 0 and v_sin_facturar = 0),
    'sin_vincular', v_a,
    'facturan_sin_estar_activas', v_b,
    'activas_sin_blu', v_c);
end;
$function$;
