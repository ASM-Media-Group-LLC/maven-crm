-- Resumen de INGRESOS BLU (ventas de las modelos) por cuenta agencia, para la tool
-- get_blu_sales del bot. "Ventas" para Álvaro es ambiguo: closers (reclutamiento/productos)
-- o los ingresos BLU de las modelos — y BLU son DOS cuentas agencia (Kash Plus y Kash
-- Massive) con accesos separados. Esta RPC agrega creator_daily_earnings partido por
-- creator_business.kash_type (lo puebla el blu-bridge por cuenta: Plus=Carolina,
-- Massive=Fabiana).
--
-- Agregación en SQL a propósito: un mes de earnings son ~4.000 filas y PostgREST capea a
-- 1.000 — leerlas desde la edge sub-contaría en silencio (ver maven_data_rls_gotchas).
CREATE OR REPLACE FUNCTION public.get_blu_sales_summary(p_tenant uuid, p_kash text, p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select e.date::date as d, e.total_gross, e.creator_id,
           coalesce(cb.kash_type, '(sin cuenta)') as kash_type,
           coalesce(nullif(c.artistic_name,''), c.name) as creadora
    from creator_daily_earnings e
    join creators c on c.id = e.creator_id
    left join creator_business cb on cb.creator_id = e.creator_id
    where e.tenant_id = p_tenant
      and e.date::date between p_from and p_to
      and (lower(coalesce(p_kash,'both')) = 'both'
           or lower(coalesce(cb.kash_type,'')) = lower(p_kash))
  )
  select jsonb_build_object(
    'cuenta_pedida', lower(coalesce(p_kash,'both')),
    'rango', jsonb_build_object('desde', to_char(p_from,'DD/MM'), 'hasta', to_char(p_to,'DD/MM')),
    'total_gross_usd', (select round(coalesce(sum(total_gross),0)) from base),
    'por_cuenta', (select coalesce(jsonb_object_agg(kash_type, t), '{}'::jsonb)
                     from (select kash_type, round(sum(total_gross)) as t from base group by 1) s),
    'creadoras_con_ingreso', (select count(distinct creator_id) from base where total_gross > 0),
    'top5', (select coalesce(jsonb_agg(jsonb_build_object('creadora', creadora, 'cuenta', kash_type, 'gross_usd', g) order by g desc), '[]'::jsonb)
               from (select creadora, kash_type, round(sum(total_gross)) as g
                       from base group by 1,2 order by g desc limit 5) t),
    'ultima_importacion_blu', (select to_char(max(imported_at) at time zone 'America/Bogota','DD/MM HH24:MI')
                                 from creator_daily_earnings where tenant_id = p_tenant),
    'advertencia', 'BLU liquida con ~2 días de lag: HOY y AYER suelen venir PARCIALES. Plus=Carolina, Massive=Fabiana.'
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_blu_sales_summary(uuid, text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_blu_sales_summary(uuid, text, date, date) TO authenticated, service_role;
