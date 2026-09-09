-- Ingresos, segunda parte: cerrar la tabla no cerro el modulo.
--
-- 20260909120000 cerro of_gross_earnings y missing_creatos_id_of_gross_earnings, pero 21
-- funciones SECURITY DEFINER leen creator_daily_earnings / of_gross_earnings corriendo como
-- postgres, o sea sin evaluar RLS. Dos de ellas servian datos a ANON. Medido, no deducido:
--
--   get_blu_sales_summary(tenant, null, '2026-08-01', '2026-09-09', false)
--     -> total_gross_usd = 474.997, creadoras_con_ingreso = 63, y un top5 con nombres.
--   get_sub_pricing(tenant, null, 30, null)
--     -> 55 creadoras con instagram_handle, precio efectivo por sub e ingreso_total.
--
-- El p_tenant que piden no es ningun secreto: esta hardcodeado en
-- frontend/src/hooks/useReportSchedules.ts:115 y por lo tanto viaja en el bundle publico.
--
-- Y habia un bypass equivalente para cualquier empleado logueado: get_creator_earnings_range
-- le devolvia a un Chatter (que en la tabla ve 0 filas) el ingreso de cualquier creadora
-- buscandola por handle.
--
-- SEGURIDAD DEL CAMBIO: estas 8 las llaman UNICAMENTE edge functions e infra, todas con
-- service_role (whatsapp-agent, promolog-manager-tick, scrape-profile-deep-callback,
-- _shared/agent-tools/managers.ts, infra/hubstaff-bridge). Verificado ademas que las 8 tienen
-- service_role=X PROPIO en su ACL y no heredado de PUBLIC — si fuera heredado, el revoke
-- habria dejado sin funcionar al bot de los grupos de WhatsApp.

revoke execute on function public.get_blu_sales_summary(uuid, text, date, date, boolean) from public, anon, authenticated;
revoke execute on function public.get_sub_pricing(uuid, text, integer) from public, anon, authenticated;
revoke execute on function public.get_sub_pricing(uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function public.get_creator_earnings_range(uuid, text, date, date) from public, anon, authenticated;
revoke execute on function public.manager_promo_rolling14(uuid) from public, anon, authenticated;
revoke execute on function public.get_manager_growth_feed(uuid, numeric, numeric) from public, anon, authenticated;
revoke execute on function public.alvaro_pulse(boolean) from public, anon, authenticated;
revoke execute on function public.refresh_chatter_cost_config(numeric) from public, anon, authenticated;

-- Estas cuatro si tienen gate interno (anon nunca lo pasa, auth.uid() es NULL), pero estaban
-- alcanzables por anon igual. Se les saca por profundidad, sin tocarles authenticated.
revoke execute on function public.blu_conciliacion(integer) from public, anon;
revoke execute on function public.blu_list_orphans() from public, anon;
revoke execute on function public.blu_map_creator(text, uuid) from public, anon;
revoke execute on function public.import_blu_fans(jsonb) from public, anon;

-- PENDIENTE, en la misma tanda que las 6 de Promolog y api_usage_summary:
-- get_manager_growth_stats y promo_creator_period_scores tampoco tienen gate interno, pero las
-- llama el FRONT (pantallas de Promolog), asi que conservan authenticated. Cerrarlas pide un
-- gate ADENTRO de la funcion, no un revoke.
