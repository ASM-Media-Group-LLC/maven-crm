-- EL SALDO DE GEMINI CON EL RITMO DE HOY (14/11/2026, mismo día que 20261114080000).
--
-- A las 12 m. el saldo ya iba en USD 16,94 de USD 19,87 (9:17 a. m.): Argos gasta
-- bastante más que el «USD 5,20 al día» que salía del promedio de los 3 días
-- anteriores. Desde el 13/11 al mediodía (fotos cada minuto y la IA revisa 1 de cada
-- 2) se juzgan ~400 fotos por hora en el turno de día, el doble de antes; el promedio
-- de días viejos no lo veía.
--
-- 1) El gasto por día mira también las últimas 3 horas: fotos juzgadas en 3 h × 16/3
--    (el equipo trabaja ~16 h al día con todo el ritmo; de noche casi nada). Se queda
--    el mayor de: promedio de 3 días, últimas 24 h, últimas 3 h llevadas al día.
-- 2) El precio por foto juzgada sale del 13/11, el primer día con el ritmo nuevo:
--    AI Studio cobró USD 3,46 por ~1.600 fotos juzgadas (3 a. m.–3 p. m., hora de
--    Bogotá, cuando se acabó el saldo) → USD 0,0022, que ya incluye la IA de la
--    cámara. El USD 0,0027 del 11 y 12/11 era con la mitad de fotos y la misma cámara.
--    Cuando el dueño anota el saldo real de AI Studio, la cuenta sigue desde ahí.

update public.costos_servicios set
  precio_unitario_usd = 0.0022,
  como_se_calcula = 'Fotos juzgadas por Argos × USD 0,0022, que ya incluye la IA de la cámara (AI Studio, 13/11, primer día con fotos cada minuto: USD 3,46 por ~1.600 fotos juzgadas)'
  where id = 'google_ia';

create or replace function public.ia_saldo_calculo()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p record;
  v_precio numeric;
  v_juzgadas integer := 0;
  v_gastado numeric := 0;
  v_saldo numeric;
  v_promedio numeric;
  v_ultimas24 integer;
  v_ultimas3 integer;
  v_ritmo numeric;
  v_dias numeric;
  v_ultimo_ok timestamptz;
  v_sin_saldo_at timestamptz;
  v_sin_saldo_id bigint;
  v_activo boolean;
  v_pocos numeric;
  v_hoy numeric;
  v_estado text;
begin
  select s.id, s.saldo_usd, s.medido_at, s.origen into p
    from public.costos_saldo s
   where s.servicio_id = 'google_ia'
   order by s.medido_at desc, s.id desc
   limit 1;
  select coalesce(c.precio_unitario_usd, 0.0022) into v_precio from public.costos_servicios c where c.id = 'google_ia';
  v_precio := coalesce(v_precio, 0.0022);

  if p.id is not null then
    select count(*) into v_juzgadas
      from public.monitor_capturas c
     where c.created_at >= p.medido_at and c.veredicto is not null;
    v_gastado := round(v_juzgadas * v_precio, 2);
    v_saldo := p.saldo_usd - v_gastado;
  end if;

  select avg(x.n) into v_promedio from (
    select count(*) as n
      from public.monitor_capturas c
     where c.veredicto is not null
       and c.created_at >= (date_trunc('day', now() at time zone 'America/Bogota') - interval '10 days') at time zone 'America/Bogota'
       and c.created_at < date_trunc('day', now() at time zone 'America/Bogota') at time zone 'America/Bogota'
     group by (c.created_at at time zone 'America/Bogota')::date
    having count(*) >= 200
     order by (c.created_at at time zone 'America/Bogota')::date desc
     limit 3
  ) x;
  select count(*) filter (where c.created_at >= now() - interval '24 hours'),
         count(*) filter (where c.created_at >= now() - interval '3 hours')
    into v_ultimas24, v_ultimas3
    from public.monitor_capturas c
   where c.veredicto is not null and c.created_at >= now() - interval '24 hours';
  v_ritmo := round(greatest(coalesce(v_promedio, 0), v_ultimas24, v_ultimas3 * 16.0 / 3) * v_precio, 2);

  select max(d.at) into v_ultimo_ok
    from public.argos_diag d
   where d.paso = 'ok' and d.at > now() - interval '3 days' and d.detalle ->> 'proveedor' = 'gemini';
  select d.at, d.id into v_sin_saldo_at, v_sin_saldo_id
    from public.argos_diag d
   where d.paso in ('fin', 'vision_error') and d.at > now() - interval '3 days'
     and ((d.detalle -> 'fallas' ->> 'gemini') like '402%'
          or (d.detalle -> 'fallas' ->> 'gemini') ilike '%prepayment credits%')
   order by d.at desc
   limit 1;

  select coalesce((select m.activo from public.monitor_config m where m.id = 1), true) into v_activo;

  v_pocos := greatest(2 * v_ritmo, 8);
  v_hoy := greatest(v_ritmo, 4);
  v_dias := case when v_saldo is not null and v_ritmo > 0 then round(greatest(v_saldo, 0) / v_ritmo, 1) end;

  v_estado := case
    when v_sin_saldo_at is not null and v_sin_saldo_at > coalesce(v_ultimo_ok, '-infinity'::timestamptz) then 'sin_saldo'
    when p.id is null then 'sin_dato'
    -- Por la cuenta ya se acabó hace rato (medio día de gasto) y Google sigue
    -- respondiendo: alguien recargó o el precio cambió → hay que anotar el saldo.
    when v_saldo <= -greatest(v_ritmo / 2, 3) then 'anotar'
    when v_saldo <= v_hoy then 'se_acaba_hoy'
    when v_saldo <= v_pocos then 'pocos_dias'
    else 'bien'
  end;

  return jsonb_build_object(
    'estado', v_estado,
    'saldo_usd', case when v_saldo is null then null else round(v_saldo, 2) end,
    'punto', case when p.id is null then null else jsonb_build_object(
      'id', p.id, 'saldo_usd', p.saldo_usd, 'medido_at', p.medido_at, 'origen', p.origen) end,
    'juzgadas_desde', v_juzgadas,
    'gastado_usd', v_gastado,
    'precio_foto_usd', v_precio,
    'ritmo_dia_usd', v_ritmo,
    'dias_restantes', v_dias,
    'se_acaba_at', case when v_dias is null then null else now() + make_interval(secs => (v_dias * 86400)::double precision) end,
    'umbral_pocos_usd', v_pocos,
    'umbral_hoy_usd', v_hoy,
    'ultimo_ok', v_ultimo_ok,
    'sin_saldo_at', v_sin_saldo_at,
    'sin_saldo_id', v_sin_saldo_id,
    'argos_activo', v_activo,
    'calculado_at', now()
  );
end
$$;
revoke all on function public.ia_saldo_calculo() from public, anon, authenticated;
