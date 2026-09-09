-- Promolog: sacar a anon de las funciones SECURITY DEFINER.
--
-- Cerrar promolog_entries con RLS no alcanza: 20 funciones SECURITY DEFINER leen esas
-- tablas, y una funcion definer corre como su dueno (postgres) y no evalua RLS. Once de
-- ellas eran ejecutables por anon, o sea por cualquiera con la publishable key, que va
-- dentro del bundle del frontend. Dos casos concretos, medidos:
--
--   · api_promolog_daily(...) devolvia dia, creator_id, el NOMBRE de la creadora
--     (artistic_name), red y conteos de promos. 500 filas por llamada y acepta _offset,
--     asi que se paginaba la base entera. Sin sesion.
--   · promolog_purgar_evidencia(_creator) hace
--       update promolog_entries set evidence_url = null ... where creator_id = _creator
--     y tenia anon=X. O sea: un anonimo borraba la evidencia de una creadora. Y los
--     creator_id ni habia que adivinarlos, los servia la propia api_promolog_daily.
--
-- Quien llama a cada una esta verificado contra el repo (grep en frontend/src,
-- supabase/functions e infra), para no romper nada.

-- ---------------------------------------------------------------------------
-- A) Las que llama el FRONT como usuario logueado: se les quita PUBLIC y anon,
--    se les deja authenticated.
-- ---------------------------------------------------------------------------

-- frontend/src/pages/promolog/usePromologAgentStats.ts
revoke execute on function public.get_distinct_promolog_agents() from public, anon;

-- frontend/src/pages/sales-performance/useVentasTops.ts, creadores/ManagerSelect.tsx,
-- admin/useRoles.ts
revoke execute on function public.ventas_tops(date, date, integer) from public, anon;

-- frontend/src/pages/chatters/feedbackTL.ts (y whatsapp-agent, que va por service_role)
revoke execute on function public.corte_cierre_prep(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- B) Las que solo llaman edge functions con SERVICE_ROLE_KEY. service_role tiene su
--    propio grant, asi que sacarles PUBLIC/anon no las afecta.
-- ---------------------------------------------------------------------------

-- supabase/functions/public-api/index.ts:499 (cliente service_role en :144).
-- Su ACL no tiene authenticated: el grant era PUBLIC, asi que esto la deja solo
-- para postgres y service_role, que es lo correcto.
revoke execute on function public.api_promolog_daily(date, date, uuid, text, integer, integer) from public, anon;

-- supabase/functions/storage-retencion/index.ts. Es la unica destructiva del grupo,
-- asi que tambien le sacamos authenticated: no la llama nadie desde el navegador.
revoke execute on function public.promolog_purgar_evidencia(uuid) from public, anon, authenticated;

-- supabase/functions/_shared/agent-tools/managers.ts
revoke execute on function public.get_promo_day_faltantes(uuid, date, text) from public, anon;
revoke execute on function public.manager_promo_rolling14(uuid) from public, anon;

-- supabase/functions/whatsapp-agent/index.ts y _shared/agent-tools/promolog.ts
revoke execute on function public.get_promolog_action_feed(uuid) from public, anon;
revoke execute on function public.promolog_fallos_bloque() from public, anon;

-- supabase/functions/promolog-scan-targets/index.ts
revoke execute on function public.promolog_ig_scan_state_today() from public, anon;

-- Sin ningun llamador en todo el repo (ni front, ni edge, ni infra).
revoke execute on function public.promolog_dispatched_today(uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- PENDIENTE, a proposito, para no ampliar el radio de este cambio:
-- las seis del bloque B que siguen con EXECUTE para `authenticated`
-- (get_promo_day_faltantes, manager_promo_rolling14, get_promolog_action_feed,
-- promolog_fallos_bloque, promolog_ig_scan_state_today, promolog_dispatched_today)
-- las puede llamar cualquier empleado logueado aunque no tenga el modulo Promolog.
-- get_promolog_action_feed devuelve name + instagram_handle. Ninguna la usa el front
-- (verificado por grep), asi que revocarles authenticated deberia ser inocuo, pero va
-- en una tanda aparte para poder revertir sin tocar lo de hoy.
-- ---------------------------------------------------------------------------
