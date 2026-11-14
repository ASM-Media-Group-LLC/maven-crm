-- EL SALDO DE GEMINI, EN VIVO Y CON AVISO ANTES DE QUE SE ACABE (Alvaro, 14/11/2026).
--
-- «En la parte de costos tienes que estar muy pilas de cuánto queda… estar
-- conectadísimo.» Gemini (la IA de Argos y de la cámara) es prepago: cuando el
-- saldo llega a 0 Google corta la llave y Argos deja de juzgar sin avisar a nadie
-- (pasó el 13/11 a las 3 p. m. y no se supo hasta el otro día).
--
-- Google NO da el saldo por API (solo se ve en AI Studio, con horas de retraso),
-- así que Maven lo lleva solo:
--   saldo de ahora ≈ último saldo anotado (al recargar o leído en AI Studio)
--                    − fotos juzgadas desde entonces × precio por foto juzgada.
-- El precio por foto juzgada INCLUYE la IA de la cámara (monitor-vision, Flash-
-- Lite, desde el 11/11), que crece con las mismas horas de trabajo. Sale de AI
-- Studio: el 11/11 y el 12/11 costaron USD 5,61 + USD 5,37 = USD 10,98 por 4.087
-- fotos juzgadas → USD 0,0027 por foto. (Antes del 11/11, sin la cámara, eran
-- USD 0,0014: el 9 y 10/11, USD 5,68 por 4.070 fotos.) Va un poco por encima a
-- propósito: más vale avisar un día antes que uno tarde.
--
-- Y lo que no es estimado: si Google responde «prepayment credits are depleted»
-- (402) a Argos, el estado pasa a SIN SALDO al momento (argos_diag).
--
-- Esta migración:
--   1. costos_saldo: cada saldo anotado (recarga o lectura de AI Studio). Solo el
--      dueño lo ve; se escribe solo por ia_saldo_anotar().
--   2. ia_saldo_calculo(): el estado (bien / pocos_dias / se_acaba_hoy / anotar /
--      sin_saldo / sin_dato), el saldo de ahora, el gasto por día y cuándo se
--      acaba. ia_saldo_estado() es lo mismo para la página (solo el dueño).
--   3. ia_saldo_anotar(): el dueño anota el saldo que muestra AI Studio.
--   4. vigilar_saldo_ia() cada 10 min: aviso (push) al dueño UNA vez por cada
--      cosa: quedan ~2 días, se acaba hoy, se acabó (Google cortó) y «recargaste:
--      anota el saldo». costos_saldo_avisos guarda qué ya se avisó.
--   5. El precio de google_ia pasa a USD 0,0027 por foto juzgada (con la cámara)
--      y se siembra el primer saldo: la recarga de USD 20 del 14/11 (AI Studio
--      mostró USD 19,87 después de pagar los USD 0,13 que se debían).

-- ── 1) Los saldos anotados ───────────────────────────────────────────────────
create table if not exists public.costos_saldo (
  id bigint generated always as identity primary key,
  servicio_id text not null references public.costos_servicios (id) on delete cascade,
  medido_at timestamptz not null default now(),
  saldo_usd numeric(10, 2) not null check (saldo_usd > -1000 and saldo_usd < 100000),
  origen text not null check (origen in ('recarga', 'lectura')),
  nota text,
  anotado_por uuid references auth.users (id) on delete set null
);
create index if not exists costos_saldo_servicio_idx on public.costos_saldo (servicio_id, medido_at desc);
alter table public.costos_saldo enable row level security;
create policy costos_saldo_solo_dueno on public.costos_saldo
  for select to authenticated using (public.es_dueno((select auth.uid())));
revoke insert, update, delete on public.costos_saldo from anon, authenticated;

-- Qué aviso ya salió (uno por cosa). Sin políticas: solo las funciones de aquí.
create table if not exists public.costos_saldo_avisos (
  servicio_id text not null,
  tipo text not null check (tipo in ('pocos_dias', 'se_acaba_hoy', 'sin_saldo', 'anotar')),
  clave bigint not null,
  avisado_at timestamptz not null default now(),
  primary key (servicio_id, tipo, clave)
);
alter table public.costos_saldo_avisos enable row level security;
revoke all on public.costos_saldo_avisos from anon, authenticated;

-- ── 2) El cálculo ────────────────────────────────────────────────────────────
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
  select coalesce(c.precio_unitario_usd, 0.0027) into v_precio from public.costos_servicios c where c.id = 'google_ia';
  v_precio := coalesce(v_precio, 0.0027);

  if p.id is not null then
    select count(*) into v_juzgadas
      from public.monitor_capturas c
     where c.created_at >= p.medido_at and c.veredicto is not null;
    v_gastado := round(v_juzgadas * v_precio, 2);
    v_saldo := p.saldo_usd - v_gastado;
  end if;

  -- Gasto por día: el promedio de los últimos 3 días completos (hora de Bogotá)
  -- en que Argos juzgó de verdad (≥ 200 fotos), o las últimas 24 h si fueron más.
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
  select count(*) into v_ultimas24
    from public.monitor_capturas c
   where c.veredicto is not null and c.created_at >= now() - interval '24 hours';
  v_ritmo := round(greatest(coalesce(v_promedio, 0), v_ultimas24) * v_precio, 2);

  -- Lo que no es estimado: ¿Google está cortando por saldo? (argos_diag, 3 días)
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

-- Para la página: lo mismo, solo el dueño.
create or replace function public.ia_saldo_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_dueno((select auth.uid())) then
    raise exception 'solo el dueño' using errcode = '42501';
  end if;
  return public.ia_saldo_calculo();
end
$$;
revoke all on function public.ia_saldo_estado() from public, anon;
grant execute on function public.ia_saldo_estado() to authenticated;

-- ── 3) El dueño anota el saldo que muestra AI Studio ─────────────────────────
create or replace function public.ia_saldo_anotar(_saldo numeric, _recarga boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_dueno((select auth.uid())) then
    raise exception 'solo el dueño' using errcode = '42501';
  end if;
  if _saldo is null or _saldo <= -1000 or _saldo >= 100000 then
    raise exception 'saldo fuera de rango' using errcode = '22023';
  end if;
  insert into public.costos_saldo (servicio_id, saldo_usd, origen, nota, anotado_por)
  values ('google_ia', round(_saldo, 2), case when _recarga then 'recarga' else 'lectura' end,
          case when _recarga then 'Recarga anotada en Costos' else 'Saldo leído en AI Studio' end,
          (select auth.uid()));
  return public.ia_saldo_calculo();
end
$$;
revoke all on function public.ia_saldo_anotar(numeric, boolean) from public, anon;
grant execute on function public.ia_saldo_anotar(numeric, boolean) to authenticated;

-- ── 4) El vigía: avisa al dueño una vez por cosa ─────────────────────────────
create or replace function public.vigilar_saldo_ia()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb := public.ia_saldo_calculo();
  v_estado text := v ->> 'estado';
  v_tipo text;
  v_clave bigint;
  v_titulo text;
  v_mensaje text;
  v_saldo text := to_char(greatest(coalesce((v ->> 'saldo_usd')::numeric, 0), 0), 'FM999990.00');
  v_dias text := replace(to_char(coalesce((v ->> 'dias_restantes')::numeric, 2), 'FM990.0'), '.', ',');
  v_ritmo text := to_char(coalesce((v ->> 'ritmo_dia_usd')::numeric, 0), 'FM999990.00');
  v_cuando text := to_char(((v ->> 'se_acaba_at')::timestamptz) at time zone 'America/Bogota', 'DD/MM "a las" HH24:MI');
  v_nuevo integer;
begin
  if v_estado = 'sin_saldo' then
    v_tipo := 'sin_saldo';
    v_clave := (v ->> 'sin_saldo_id')::bigint;
    v_titulo := 'Gemini se quedó sin saldo: Argos dejó de juzgar';
    v_mensaje := 'Google cortó la IA de Argos y de la cámara por saldo agotado. Recarga en AI Studio (Billing → Buy credits) y anota el saldo en Costos; Argos vuelve solo al recargar.';
  elsif v_estado in ('se_acaba_hoy', 'pocos_dias', 'anotar') then
    v_tipo := v_estado;
    v_clave := (v -> 'punto' ->> 'id')::bigint;
    if v_estado = 'se_acaba_hoy' then
      v_titulo := 'El saldo de Gemini se acaba hoy';
      v_mensaje := format('Quedan ~USD %s y Argos gasta ~USD %s al día: alcanza hasta el %s. Recarga en AI Studio para que Argos no se apague.', v_saldo, v_ritmo, coalesce(v_cuando, 'hoy'));
    elsif v_estado = 'pocos_dias' then
      v_titulo := format('Al saldo de Gemini le quedan ~%s días', v_dias);
      v_mensaje := format('Quedan ~USD %s y Argos gasta ~USD %s al día: alcanza hasta el %s. Recarga en AI Studio antes de que se apague.', v_saldo, v_ritmo, coalesce(v_cuando, 'pronto'));
    else
      v_titulo := 'Argos sigue funcionando, pero Maven no sabe el saldo de Gemini';
      v_mensaje := 'Por la cuenta de Maven el saldo ya se acabó, pero Google sigue respondiendo: parece que recargaste. Anota en Costos el saldo que muestra AI Studio para seguir midiendo.';
    end if;
  else
    return 0;
  end if;
  if v_clave is null then
    return 0;
  end if;

  insert into public.costos_saldo_avisos (servicio_id, tipo, clave)
  values ('google_ia', v_tipo, v_clave)
  on conflict do nothing;
  get diagnostics v_nuevo = row_count;
  if v_nuevo = 0 then
    return 0;
  end if;

  insert into public.notifications
    (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
  select o.user_id, 'costos_saldo_ia', v_titulo, v_mensaje,
         'costos', 'Oficina', 'high', 'new', 'personal', '/oficina/costos'
    from (select distinct user_id from public.tenant_owners) o;
  return 1;
end
$$;
revoke all on function public.vigilar_saldo_ia() from public, anon, authenticated;

-- ── 5) El precio real y el primer saldo ──────────────────────────────────────
update public.costos_servicios set
  precio_unitario_usd = 0.0027,
  como_se_calcula = 'Fotos juzgadas por Argos × USD 0,0027, que ya incluye la IA de la cámara (AI Studio, 11 y 12/11: USD 10,98 por 4.087 fotos juzgadas)'
  where id = 'google_ia';

insert into public.costos_saldo (servicio_id, medido_at, saldo_usd, origen, nota)
select 'google_ia', '2026-11-14 14:17:00+00', 19.87, 'recarga',
       'Recarga de USD 20 del 14/11; AI Studio mostró USD 19,87 (se pagaron USD 0,13 que se debían)'
 where exists (select 1 from public.costos_servicios where id = 'google_ia')
   and not exists (select 1 from public.costos_saldo where servicio_id = 'google_ia');

-- El vigía cada 10 min. Protegido: pg_cron solo existe en la base real.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return;
  end if;
  perform cron.unschedule(j.jobname) from cron.job j where j.jobname = 'vigilar-saldo-ia';
  perform cron.schedule('vigilar-saldo-ia', '*/10 * * * *', $cron$ select public.vigilar_saldo_ia(); $cron$);
end
$$;
