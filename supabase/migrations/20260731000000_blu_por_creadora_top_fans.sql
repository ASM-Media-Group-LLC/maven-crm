-- (1) INGRESO BLU POR CREADORA con fechas LIBRES. get_creator_earnings usa ventanas fijas
-- (7d/30d) y get_blu_sales_summary agrega toda la cuenta: no había forma de responder
-- "¿cuánto hizo Wanderslover del 1 al 15 de julio?". Para comparar períodos se llama 2 veces.
CREATE OR REPLACE FUNCTION public.get_creator_earnings_range(p_tenant uuid, p_query text, p_from date, p_to date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with c as (
    select cr.id, coalesce(nullif(cr.artistic_name,''), cr.name) as creadora,
           cr.instagram_handle, cb.kash_type
    from creators cr
    left join creator_business cb on cb.creator_id = cr.id
    where lower(cr.instagram_handle) = regexp_replace(lower(trim(p_query)),'^@','')
       or coalesce(cr.artistic_name, cr.name) ilike '%'||p_query||'%'
       or cr.name ilike '%'||p_query||'%'
    order by (lower(cr.instagram_handle) = regexp_replace(lower(trim(p_query)),'^@','')) desc,
             (cr.status='active') desc
    limit 1
  ),
  e as (
    select d.* from creator_daily_earnings d join c on c.id = d.creator_id
    where d.tenant_id = p_tenant and d.date::date between p_from and p_to
  )
  select jsonb_build_object(
    'creadora', c.creadora,
    'cuenta_kash', coalesce(c.kash_type, '(sin cuenta)'),
    'rango', to_char(p_from,'DD/MM')||' al '||to_char(p_to,'DD/MM'),
    'total_gross_usd', (select round(coalesce(sum(total_gross),0)) from e),
    'dias_con_datos', (select count(*) from e),
    'desglose', (select jsonb_build_object(
        'suscripciones', round(coalesce(sum(subscription_gross),0)),
        'tips', round(coalesce(sum(tips_gross),0)),
        'mensajes_ppv', round(coalesce(sum(message_gross),0)),
        'posts', round(coalesce(sum(post_gross),0)),
        'streams', round(coalesce(sum(stream_gross),0)),
        'referidos', round(coalesce(sum(referral_gross),0))) from e),
    'fans', (select jsonb_build_object('activos_ult_dia',
              (select active_fans from e order by date desc limit 1),
              'nuevos_en_rango', round(coalesce(sum(new_fans),0))) from e),
    'mejor_dia', (select jsonb_build_object('fecha', to_char(date,'DD/MM'), 'usd', round(total_gross))
                    from e order by total_gross desc nulls last limit 1),
    'advertencia', 'BLU liquida con ~2 días de lag: los últimos 2 días del rango pueden venir PARCIALES.'
  )
  from c;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_creator_earnings_range(uuid, text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_earnings_range(uuid, text, date, date) TO authenticated, service_role;

-- (2) MEJORES FANS POR CREADORA. La data ya existía en creator_top_fans (806 filas, 60
-- creadoras) pero NINGUNA tool la exponía → el bot le decía a Álvaro que no la tenía.
-- ⚠️ creator_top_fans tiene VARIAS ventanas de snapshot por creadora y SE SOLAPAN
-- (29/06-11/07, 29/06-15/07, 29/06-31/07 son acumulativos del mismo período; más una de
-- 30/07-31/07 con 51 creadoras). Sumar across ventanas DUPLICA el gasto de un mismo fan.
-- Se elige UNA ventana: la que termina más tarde y, a igualdad, la más larga. Se devuelve
-- SIEMPRE para que el bot aclare el período (wanderslover facturó $19k en julio pero su top
-- fan del snapshot de 2 días es $60 — sin la aclaración da una impresión falsa).
CREATE OR REPLACE FUNCTION public.get_creator_top_fans(p_tenant uuid, p_query text, p_limit int DEFAULT 10)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
  win as (
    select f.snapshot_from, f.snapshot_to
    from creator_top_fans f, c
    where f.creator_id = c.id
    group by f.snapshot_from, f.snapshot_to
    order by f.snapshot_to desc, (f.snapshot_to - f.snapshot_from) desc
    limit 1
  ),
  fans as (
    select f.* from creator_top_fans f, c, win
    where f.creator_id = c.id
      and f.snapshot_from = win.snapshot_from and f.snapshot_to = win.snapshot_to
  ),
  ranked as (
    select row_number() over (order by spent_gross desc nulls last) as puesto, *
    from fans order by spent_gross desc nulls last
    limit greatest(1, least(coalesce(p_limit,10), 25))
  )
  select jsonb_build_object(
    'creadora', c.creadora,
    'ventana', (select to_char(snapshot_from,'DD/MM')||' al '||to_char(snapshot_to,'DD/MM') from win),
    'dias_de_la_ventana', (select (snapshot_to - snapshot_from) + 1 from win),
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
        'fans_en_la_ventana', count(*),
        'gasto_total_usd', round(coalesce(sum(spent_gross),0)),
        'top3_pct', case when coalesce(sum(spent_gross),0) > 0 then
            round(100.0 * (select coalesce(sum(spent_gross),0)
                             from (select spent_gross from fans order by spent_gross desc nulls last limit 3) x)
                  / sum(spent_gross)) else null end)
        from fans),
    'nota', 'Snapshot de BLU, NO es el total histórico: solo cubre la ventana indicada. Si la ventana es corta (ej. 2 días) los montos van a ser MUY inferiores a su facturación del mes — aclarálo al reportar.'
  )
  from c;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_creator_top_fans(uuid, text, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_top_fans(uuid, text, int) TO authenticated, service_role;
