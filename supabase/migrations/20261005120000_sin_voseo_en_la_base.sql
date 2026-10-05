-- Español neutro (tú, sin voseo) en lo que arma la base y le llega a una persona.
--
-- El frontend ya tiene su guarda (frontend/src/test/i18n/sinVoseo.test.ts) y la
-- migración 20260929180000_funciones_sin_voseo.sql limpió diez funciones, pero
-- una búsqueda en prod el 05/10 (solo lectura: pg_proc.prosrc de public, vistas,
-- defaults, checks, cron y las tablas con textos de sistema) encontró tres
-- funciones vivas que todavía voseaban:
--
--   recover_stuck_spammer_scans — scan_error de la cuenta de IG que no se pudo leer
--     antes:   «… Reintentá el scan o subí un screenshot del perfil.»
--     después: «… Reintenta el scan o sube un screenshot del perfil.»
--     (la de 29/09 le cambió «Hacé click en» del otro mensaje y no vio este)
--   get_manager_growth_feed — diagnóstico del feed de crecimiento de las managers
--     antes:   «… NO es un problema de calidad: verificá si realmente está promocionando …»
--     después: «… NO es un problema de calidad: verifica si realmente está promocionando …»
--   get_creator_top_fans — la «nota» que lee el bot cuando no hay top-fans del período
--     antes:   «… Decilo tal cual — NO uses otro período …»
--     después: «… Dilo tal cual — NO uses otro período …»
--
-- Cada función es la definición EXACTA de prod (pg_get_functiondef del 05/10) con
-- solo ese texto cambiado: misma firma, mismo SECURITY DEFINER y search_path, y
-- CREATE OR REPLACE conserva dueño y grants. Ninguna lógica cambia.
-- La guarda de abajo compara md5(prosrc) con la huella de prod del 05/10 y aborta
-- si alguien tocó la función desde entonces (hay que volver a leerla). Al final se
-- verifica la huella nueva, para que un carácter cambiado al aplicar no pase.
--
-- Lo que queda afuera, a propósito:
--   · «acá» en COMENTARIOS de cinco funciones (api_keys_asignar_agencia,
--     api_webhooks_timbrar, can_manage_user, create_recruitment_deal_for_contact,
--     sync_closers_contact_to_creators): no lo ve nadie, y reemplazar
--     can_manage_user o api_webhooks_timbrar solo por un comentario no vale el
--     riesgo ni que otra migración que las toque choque con esta guarda.
--   · los prompts de los bots de WhatsApp guardados como datos
--     (wa_bots.manual_prompt de «Bot de Managers», «AI Warming» y «Clari (privado)»,
--     y whatsapp_groups.bot_persona de «Marketing/Ventas»): son textos largos que
--     se editan desde la app y WhatsApp está apagado desde el 01/10. Van aparte.

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'recover_stuck_spammer_scans' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'a49f22d269338d41776865dddf43b87f' THEN
    RAISE EXCEPTION 'recover_stuck_spammer_scans cambió en la base: revisar antes de reemplazarla';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'get_manager_growth_feed' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM '5fed107f5f0730e05c26ee2f99d2102f' THEN
    RAISE EXCEPTION 'get_manager_growth_feed cambió en la base: revisar antes de reemplazarla';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'get_creator_top_fans' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'b3c00e1fdd98160b2b5e87ea9fed29b8' THEN
    RAISE EXCEPTION 'get_creator_top_fans cambió en la base: revisar antes de reemplazarla';
  END IF;
END $$;

-- recover_stuck_spammer_scans: «Reintentá el scan o subí un screenshot del perfil.» → «Reintenta el scan o sube un screenshot del perfil.»
CREATE OR REPLACE FUNCTION public.recover_stuck_spammer_scans()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unreadable_count integer;
  v_failed_count integer;
BEGIN
  -- Stuck con TODOS los campos null → no pudimos leer la cuenta. Va a
  -- awaiting_screenshot para que el user reintente o suba capturas.
  -- NO se marca is_restricted (antes lo hacía → falsos positivos).
  UPDATE public.scouter_spammer_accounts
  SET scan_status = 'awaiting_screenshot',
      scan_error = 'No pudimos leer el perfil automáticamente (cuenta muy nueva o IG bloqueó la lectura). Reintenta el scan o sube un screenshot del perfil.',
      last_scanned_at = now()
  WHERE scan_status IN ('scanning','pending')
    AND created_at < now() - interval '5 minutes'
    AND (last_scanned_at IS NULL OR last_scanned_at < now() - interval '5 minutes')
    AND bio IS NULL
    AND followers_count IS NULL
    AND posts_count IS NULL
    AND profile_pic_url IS NULL;
  GET DIAGNOSTICS v_unreadable_count = ROW_COUNT;

  -- Stuck con algún dato → error técnico real (timeout, excepción, etc).
  -- Marcar como failed con mensaje para que el user re-dispare.
  UPDATE public.scouter_spammer_accounts
  SET scan_status = 'failed',
      scan_error = 'Scan se quedó colgado más de 5 minutos. Haz clic en "Re-scan" para reintentar.',
      last_scanned_at = now()
  WHERE scan_status IN ('scanning','pending')
    AND created_at < now() - interval '5 minutes'
    AND (last_scanned_at IS NULL OR last_scanned_at < now() - interval '5 minutes');
  GET DIAGNOSTICS v_failed_count = ROW_COUNT;

  RETURN v_unreadable_count + v_failed_count;
END;
$function$;

-- get_manager_growth_feed: «verificá si realmente está promocionando» → «verifica si realmente está promocionando»
CREATE OR REPLACE FUNCTION public.get_manager_growth_feed(p_tenant uuid, p_low_promo_rate numeric DEFAULT 0.40, p_income_drop_pct numeric DEFAULT 15)
 RETURNS TABLE(creator_id uuid, name text, instagram_handle text, category text, manager_profile_id uuid, manager_name text, manager_phone text, promo_days integer, covered_days integer, mtd_day integer, income_mtd numeric, income_prev_mtd numeric, income_trend_pct numeric, quadrant text, priority integer, diagnosis text, promo_networks text, ig_has_data boolean, ig_promo_days integer, ig_read_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with b0 as (
    select
      date_trunc('month', (now() at time zone 'America/Bogota')::date)::date as this_start,
      extract(day from (now() at time zone 'America/Bogota')::date)::int as mtd_day,
      greatest(date_trunc('month', (now() at time zone 'America/Bogota')::date)::date, (now() at time zone 'America/Bogota')::date - 2)::date as inc_cutoff,
      (date_trunc('month', (now() at time zone 'America/Bogota')::date) - interval '1 month')::date as prev_start
  ),
  bounds as (
    select this_start, mtd_day, inc_cutoff,
      extract(day from inc_cutoff)::int as income_day,
      prev_start,
      least(prev_start + (inc_cutoff - this_start), this_start - 1) as prev_cutoff
    from b0
  ),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.category, c.assigned_manager_profile_id as mgr
    from creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    select e.creator_id,
      count(distinct e.dia) filter (where e.promoted in ('true','yes','partial')) as promo_days,
      count(distinct e.dia) filter (where coalesce(e.promoted,'') <> 'pending') as covered_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.dia >= b.this_start
    group by e.creator_id
  ),
  net_days as (
    select e.creator_id, e.network,
      count(distinct e.dia) filter (where e.promoted in ('true','yes','partial')) as d
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.dia >= b.this_start
    group by e.creator_id, e.network
  ),
  nets as (
    select creator_id,
      string_agg(network || ':' || d || 'd', ', ' order by d desc, network) as promo_networks
    from net_days where d > 0 group by creator_id
  ),
  ig as (
    select e.creator_id,
      count(distinct e.dia) filter (where e.promoted in ('true','yes','partial')) as ig_promo_days,
      count(distinct e.dia) filter (where coalesce(e.promoted,'') <> 'pending') as ig_read_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.dia >= b.this_start and e.network = 'instagram'
    group by e.creator_id
  ),
  inc as (
    select e.creator_id,
      coalesce(sum(e.total_gross) filter (where e.date >= b.this_start and e.date <= b.inc_cutoff), 0) as income_mtd,
      coalesce(sum(e.total_gross) filter (where e.date >= b.prev_start and e.date <= b.prev_cutoff), 0) as income_prev_mtd
    from creator_daily_earnings e cross join bounds b
    where e.date >= b.prev_start
    group by e.creator_id
  ),
  scored as (
    select a.id, a.name, a.instagram_handle, a.category, a.mgr,
      m.full_name as manager_name, m.phone_e164 as manager_phone,
      coalesce(p.promo_days,0) as promo_days, coalesce(p.covered_days,0) as covered_days,
      b.mtd_day, b.income_day,
      coalesce(i.income_mtd,0) as income_mtd, coalesce(i.income_prev_mtd,0) as income_prev_mtd,
      n.promo_networks,
      coalesce(g.ig_promo_days,0) as ig_promo_days,
      coalesce(g.ig_read_days,0) as ig_read_days,
      (coalesce(g.ig_promo_days,0) > 0
        and coalesce(g.ig_promo_days,0) * 10 >= coalesce(p.promo_days,0) * 3) as ig_is_channel,
      (coalesce(p.covered_days,0) >= 5 and coalesce(p.promo_days,0) < p_low_promo_rate * coalesce(p.covered_days,0)) as low_promo,
      (coalesce(i.income_prev_mtd,0) > 0 and coalesce(i.income_mtd,0) < coalesce(i.income_prev_mtd,0) * (1 - p_income_drop_pct/100.0)) as income_down,
      case when coalesce(i.income_prev_mtd,0) > 0
           then round(((coalesce(i.income_mtd,0) - i.income_prev_mtd) / i.income_prev_mtd * 100)::numeric)
           else null end as income_trend_pct
    from active_models a
    cross join bounds b
    left join profiles m on m.id = a.mgr
    left join promo p on p.creator_id = a.id
    left join nets n on n.creator_id = a.id
    left join ig g on g.creator_id = a.id
    left join inc i on i.creator_id = a.id
  )
  select s.id, s.name, s.instagram_handle, s.category, s.mgr, s.manager_name, s.manager_phone,
    s.promo_days, s.covered_days, s.mtd_day, s.income_mtd, s.income_prev_mtd, s.income_trend_pct,
    case when s.low_promo and s.income_down then 'critico'
         when (not s.low_promo) and s.income_down then 'calidad'
         when s.low_promo and (not s.income_down) then 'riesgo'
         else 'sana' end as quadrant,
    case when s.low_promo and s.income_down then 1
         when (not s.low_promo) and s.income_down then 2
         when s.low_promo and (not s.income_down) then 3
         else 4 end as priority,
    case
      when s.low_promo and s.income_down then
        format('Promociona %s de %s días leídos este mes y sus ingresos caen %s%% (al día %s: $%s vs $%s el mes pasado) → empujar promo YA%s',
               s.promo_days, s.covered_days, abs(s.income_trend_pct), s.income_day, round(s.income_mtd), round(s.income_prev_mtd),
               case when s.promo_networks is null then '' else format(' [promo en %s]', s.promo_networks) end)
      when (not s.low_promo) and s.income_down then
        case
          when s.covered_days < 5 then
            format('⚠️ DATOS INSUFICIENTES este mes (solo %s días leídos): no alcanza para juzgar promo ni calidad. Su ingreso cae %s%% (al día %s) → revisar cobertura del scan/handles antes de sacar conclusiones%s',
                   s.covered_days, abs(s.income_trend_pct), s.income_day,
                   case when s.promo_networks is null then '' else format(' [promo en %s]', s.promo_networks) end)
          when s.promo_networks is null then
            format('⚠️ SIN promo registrada en NINGUNA red este mes (%s días leídos) y su ingreso cae %s%% (al día %s) → NO es un problema de calidad: verifica si realmente está promocionando y que el scan la esté cubriendo',
                   s.covered_days, abs(s.income_trend_pct), s.income_day)
          when s.ig_is_channel then
            format('Promociona bien (%s/%s días leídos) pero sus ingresos caen %s%% (al día %s vs mismo tramo del mes pasado) → revisar CALIDAD/estrategia [promo en %s]',
                   s.promo_days, s.covered_days, abs(s.income_trend_pct), s.income_day, s.promo_networks)
          else
            format('Promociona bien (%s/%s días leídos) pero sus ingresos caen %s%% (al día %s vs mismo tramo del mes pasado) → revisar CALIDAD/estrategia ⚠️ INSTAGRAM NO ES SU CANAL (IG: %s días de promo / %s leídos) — su promo es en %s: NO atribuyas la caída a las historias de IG, revisa la calidad EN ESAS REDES',
                   s.promo_days, s.covered_days, abs(s.income_trend_pct), s.income_day,
                   s.ig_promo_days, s.ig_read_days, s.promo_networks)
        end
      when s.low_promo and (not s.income_down) then
        format('Promociona poco (%s/%s días leídos este mes) — ingreso aún ok, pero riesgo a futuro → sumar promo/otra red%s',
               s.promo_days, s.covered_days,
               case when s.promo_networks is null then '' else format(' [promo en %s]', s.promo_networks) end)
      else 'Sana' end as diagnosis,
    s.promo_networks,
    (s.ig_read_days > 0) as ig_has_data,
    s.ig_promo_days,
    s.ig_read_days
  from scored s
  where s.covered_days >= 5 and not (s.low_promo = false and s.income_down = false)
  order by priority, s.income_mtd desc;
$function$;

-- get_creator_top_fans: «Decilo tal cual» → «Dilo tal cual»
CREATE OR REPLACE FUNCTION public.get_creator_top_fans(p_tenant uuid, p_query text, p_limit integer DEFAULT 10, p_period text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with c as (
    select cr.id, coalesce(nullif(cr.artistic_name,''), cr.name) as creadora
    from creators cr
    where lower(cr.instagram_handle) = regexp_replace(lower(trim(p_query)),'^@','')
       or coalesce(cr.artistic_name, cr.name) ilike '%'||p_query||'%'
       or cr.name ilike '%'||p_query||'%'
    order by (lower(cr.instagram_handle) = regexp_replace(lower(trim(p_query)),'^@','')) desc,
             (cr.status='active') desc
    limit 1
  ),
  disponibles as (
    select coalesce(jsonb_agg(distinct f.period_kind), '[]'::jsonb) as kinds
    from creator_top_fans f, c where f.creator_id = c.id
  ),
  elegido as (
    select f.period_kind
    from creator_top_fans f, c
    where f.creator_id = c.id
      and (lower(coalesce(p_period,'auto')) = 'auto' or f.period_kind = lower(p_period))
    group by f.period_kind
    order by case f.period_kind when 'alltime' then 1 when 'month' then 2 else 3 end
    limit 1
  ),
  fans as (
    select f.* from creator_top_fans f, c, elegido
    where f.creator_id = c.id and f.period_kind = elegido.period_kind
  ),
  ranked as (
    select row_number() over (order by spent_gross desc nulls last) as puesto, *
    from fans order by spent_gross desc nulls last
    limit greatest(1, least(coalesce(p_limit,10), 25))
  )
  select case
    when not exists (select 1 from elegido) then jsonb_build_object(
      'creadora', c.creadora,
      'periodo_pedido', lower(coalesce(p_period,'auto')),
      'sin_datos', true,
      'periodos_disponibles', (select kinds from disponibles),
      'nota', 'No hay top-fans importados para ese período. Dilo tal cual — NO uses otro período como si fuera el pedido. El histórico (alltime) y el mensual los trae el blu-bridge en su corrida pesada.')
    else jsonb_build_object(
      'creadora', c.creadora,
      'periodo', (select period_kind from elegido),
      'ventana', (select to_char(min(snapshot_from),'DD/MM/YY')||' al '||to_char(max(snapshot_to),'DD/MM/YY') from fans),
      'dias_de_la_ventana', (select (max(snapshot_to) - min(snapshot_from)) + 1 from fans),
      'periodos_disponibles', (select kinds from disponibles),
      'top_fans', coalesce((
        select jsonb_agg(jsonb_build_object(
          'puesto', r.puesto,
          'fan', coalesce(nullif(r.fan_name,''), r.fan_username),
          'gasto_usd', round(r.spent_gross), 'transacciones', r.transactions,
          'ppv_usd', round(coalesce(r.ppv_gross,0)), 'tips_usd', round(coalesce(r.tips_gross,0)),
          'suscripciones_usd', round(coalesce(r.subscriptions_gross,0)),
          'activo', r.is_active, 'dias_suscripto', r.subscription_length_days) order by r.puesto)
        from ranked r), '[]'::jsonb),
      'concentracion', (select jsonb_build_object(
          'fans_en_el_periodo', count(*),
          'gasto_total_usd', round(coalesce(sum(spent_gross),0)),
          'top3_pct', case when coalesce(sum(spent_gross),0) > 0 then
              round(100.0 * (select coalesce(sum(spent_gross),0)
                               from (select spent_gross from fans order by spent_gross desc nulls last limit 3) x)
                    / sum(spent_gross)) else null end)
          from fans),
      'nota', 'alltime = histórico completo · month = mes en curso · window = snapshot suelto de un sync. Di SIEMPRE de qué período hablas; si la ventana es corta, aclara que los montos no representan el mes.')
  end
  from c;
$function$;

-- La huella que tiene que quedar (md5 del cuerpo nuevo, calculada sobre este
-- archivo). Si apply_migration cambiara un solo carácter de los textos
-- (tildes, «—», «→», «⚠️»), aborta y no queda nada a medias.
DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'recover_stuck_spammer_scans' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'c9be6cd3cedf66bff054c3f3b133e62d' THEN
    RAISE EXCEPTION 'recover_stuck_spammer_scans no quedó con la huella esperada';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'get_manager_growth_feed' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM '685d326601d48ce35752f81ecebf2b20' THEN
    RAISE EXCEPTION 'get_manager_growth_feed no quedó con la huella esperada';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc
      WHERE proname = 'get_creator_top_fans' AND pronamespace = 'public'::regnamespace)
     IS DISTINCT FROM 'adff02bf74bca1dfc357f96cacd5c691' THEN
    RAISE EXCEPTION 'get_creator_top_fans no quedó con la huella esperada';
  END IF;
END $$;

-- Datos guardados con el mismo voseo: una fila en cada tabla (medido en prod el
-- 05/10). Se buscan por la huella del texto viejo EXACTO (md5), no por id ni con
-- LIKE: el UPDATE no puede tocar ningún otro texto, y si la fila ya cambió, no
-- hace nada.
--
-- scouter_spammer_accounts.scan_error: lo escribió recover_stuck_spammer_scans
-- (fila 4f491ef6-98f0-4901-bb80-057a35428d9b, 06/06, hoy en awaiting_screenshot;
-- en ese estado la app muestra su propio texto, pero el dato queda neutro para
-- quien lo lea). Su trigger scouter_spammer_accounts_set_updated_at le pone
-- updated_at = now(): es lo único que cambia además del texto.
UPDATE public.scouter_spammer_accounts
   SET scan_error = 'No pudimos leer el perfil automáticamente (cuenta muy nueva o IG bloqueó la lectura). Reintenta el scan o sube un screenshot del perfil.'
 WHERE md5(scan_error) = '325a7ca362d68379b2927618e58df122';

-- qa_calls.error_message: «Claude tardó más de 135s. Probá de nuevo.», de una
-- versión vieja de qa-analyze (fila 258b6040-3cd6-4aa7-a34e-4cca3d47ff3b, 10/08).
-- La edge de hoy ya dice «Prueba de nuevo.». qa_calls no tiene trigger de UPDATE.
UPDATE public.qa_calls
   SET error_message = 'Claude tardó más de 135s. Prueba de nuevo.'
 WHERE md5(error_message) = '875d494f99f08e77988c4115f4d9f4e9';
