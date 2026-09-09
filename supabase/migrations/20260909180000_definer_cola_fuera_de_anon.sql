-- Cola del barrido de SECURITY DEFINER: las 12 que quedaban fuera de los gate-helpers.
--
-- A estas se les saca PUBLIC y anon pero se les DEJA authenticated, porque a todas las llama
-- el navegador como usuario logueado (verificado con grep en frontend/src, una por una).
-- Cerrar el acceso anonimo es lo unico que se puede hacer con un revoke; que un empleado sin
-- el modulo correspondiente pueda llamarlas es otro problema, y se arregla con un gate ADENTRO
-- de la funcion, no aca.
--
-- ⚠️ get_cowork_user_room es un GATE-HELPER: la cita la policy "Participants see their assigned
-- room" de cowork_rooms. Lo detecto el cruce contra pg_policy que corro antes de cada tanda.
-- Si le hubieramos quitado authenticated, cowork_rooms se volvia ilegible. Por eso solo anon.
--
-- La mas urgente del lote es scouter_enqueue_autopilot_batch: era la UNICA escritura que
-- seguia alcanzable por anon. Encola trabajos de Apify facturables y le borra el paused_reason
-- al autopilot. La llama frontend/src/hooks/useScouterLeads.ts:1464.
--
-- NO se toca get_agenda_by_share_token: es un share link publico a proposito (acceso de solo
-- lectura a una tarea por token) y su token ES el mecanismo de autenticacion.
--
-- ESTADO FINAL DEL BARRIDO (medido): de 99 funciones definer sin gate alcanzables por anon
-- quedan 25, y CERO son de escritura. Las 25 son 24 gate-helpers (is_*/has_*/my_*/can_*,
-- blu_is_management, user_has_role_name, wa_supervises_department, chatter_can_view_creator)
-- mas get_agenda_by_share_token. Los gate-helpers NO se pueden cerrar: son los predicados que
-- evaluan las policies, y quitarles EXECUTE deja las tablas ilegibles para todos.
-- Nota menor asumida: un anonimo puede preguntarles "es X admin?" y recibir un booleano. Es
-- fuga de estructura organizativa, no de datos, y el costo de cerrarla es romper RLS.

revoke execute on function public.chatter_display_names(_ids uuid[]) from public, anon;
revoke execute on function public.get_agent_names(_user_ids uuid[]) from public, anon;
revoke execute on function public.get_assignable_managers() from public, anon;
revoke execute on function public.get_closer_agents() from public, anon;
revoke execute on function public.get_cowork_user_room(_user_id uuid, _session_id uuid) from public, anon;
revoke execute on function public.leadgen_agent_stats(p_date_from date, p_date_to date) from public, anon;
revoke execute on function public.leadgen_summary_stats(p_date_from date, p_date_to date, p_user_id uuid) from public, anon;
revoke execute on function public.list_chatter_evaluators() from public, anon;
revoke execute on function public.list_chatters() from public, anon;
revoke execute on function public.operations_dashboard_kpis(p_from timestamp with time zone, p_to timestamp with time zone) from public, anon;
revoke execute on function public.pick_discovery_seeds(p_total integer) from public, anon;
revoke execute on function public.scouter_enqueue_autopilot_batch(p_tenant_id uuid) from public, anon;
