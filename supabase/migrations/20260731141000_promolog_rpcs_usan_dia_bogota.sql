-- Ver 20260731140000_promolog_dia_bogota.sql para el diagnóstico completo.
-- Acá se migran los RPCs de REPORTE de `date::date` (día UTC) a `dia` (día de Bogotá).
--
-- Reemplazo programático sobre pg_get_functiondef para no transcribir cuerpos largos a
-- mano. ⚠️ En get_manager_growth_feed el alias `e` TAMBIÉN es creator_daily_earnings
-- (income_mtd/income_prev_mtd) → por eso NO se toca el patrón `e.date >= b.this_start`
-- pelado; solo el que lleva ::timestamptz, que es exclusivo del lado promolog.
-- Los RPCs de ESTADO DE SCAN (promolog_ig_scan_state_today, coverage-sweeps) quedan
-- intactos: comparan NY contra NY, son auto-consistentes y mover eso re-dispararía scans.
DO $do$
DECLARE f record; nuevo text;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_promo_month_comparison','get_manager_growth_feed',
                        'get_manager_silent_no_promo','get_promolog_action_feed',
                        'get_creator_scan_config','get_manager_roster_stats',
                        'get_promolog_stale_creators')
  LOOP
    nuevo := f.def;
    nuevo := replace(nuevo, 'e.date >= b.this_start::timestamptz', 'e.dia >= b.this_start');
    nuevo := replace(nuevo, 'e.date::date', 'e.dia');
    nuevo := replace(nuevo, 'pe.date::date', 'pe.dia');
    nuevo := replace(nuevo, 'date::date = current_date',
                            'dia = (now() at time zone ''America/Bogota'')::date');
    nuevo := replace(nuevo, 'pe.date > now() - interval ''14 days''',
                            'pe.dia > (now() at time zone ''America/Bogota'')::date - 14');
    nuevo := replace(nuevo, 'to_char(max(pe.date) at time zone ''America/Bogota'',''DD/MM'')',
                            'to_char(max(pe.dia),''DD/MM'')');
    -- get_manager_roster_stats escondía el mismo bug como ventana [día, día+1) en UTC
    nuevo := replace(nuevo, 'e.date >= d.day::timestamp', 'e.dia >= d.day');
    nuevo := replace(nuevo, 'e.date <  (d.day + 1)::timestamp', 'e.dia <= d.day');
    -- get_promolog_stale_creators: current_date también es UTC en esta sesión
    nuevo := replace(nuevo, 'e.date >= current_date - p_days',
                            'e.dia >= (now() at time zone ''America/Bogota'')::date - p_days');
    IF nuevo <> f.def THEN
      EXECUTE nuevo;
      RAISE NOTICE 'reescrita: %', f.proname;
    END IF;
  END LOOP;
END $do$;

-- Los límites del mes se calculaban con current_date (UTC): entre las 19:00 y 23:59 de
-- Bogotá ya es "mañana", así que el 1ro de mes a esa hora date_trunc('month') saltaba al
-- mes siguiente y la comparación mes-a-mes quedaba contra un rango vacío.
DO $do$
DECLARE d text; nuevo text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='get_promo_month_comparison';
  nuevo := replace(d, 'current_date', '(now() at time zone ''America/Bogota'')::date');
  IF nuevo <> d THEN EXECUTE nuevo; END IF;
END $do$;
