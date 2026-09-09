-- Segunda tanda del barrido de funciones SECURITY DEFINER: las 47 que quedaban.
--
-- Supabase le da EXECUTE a PUBLIC por defecto a toda funcion nueva. Como estas corren como
-- postgres (SECURITY DEFINER) y no evaluan RLS, cualquiera con la publishable key del bundle
-- podia ejecutarlas. Entre ellas hay amplificadores que leen el cron_internal_token de Vault y
-- disparan net.http_post (retry_stuck_qa_analyses, retry_pending_qa_report_emails,
-- run_whatsapp_followup_tick, chatter_model_backfill_tick), escrituras de asignacion
-- (wa_assign_conversation, tg_assign_conversation) y claim_whatsapp_verification_code, que
-- vincula un WhatsApp a un perfil de Maven.
--
-- TRES GUARDS verificados a mano antes de aplicar, no por el triage automatico:
--   1. Ninguna de las 47 aparece dentro de pg_get_expr de NINGUNA policy (cruce contra
--      pg_policy con \m..\M). Si una lo estuviera, revocarla dejaria la tabla ilegible para
--      todos: eso ya paso una vez con actor_level.
--   2. Las 47 tienen service_role=X PROPIO en su proacl, no heredado de PUBLIC. Por eso los
--      crons, los micros de Dokploy y las edge functions no se enteran.
--   3. Ninguna la llama el navegador (grep de cada nombre en frontend/src). Por eso se les
--      puede quitar tambien `authenticated`.
--
-- DOS EXCEPCIONES, a proposito: has_telefonos_global_scope e is_livekit_room_owner conservan
-- `authenticated`. Son predicados booleanos con forma de gate-helper (has_*/is_*) y aunque hoy
-- ninguna policy las cita, esa forma es exactamente la que una policy futura usaria; ademas
-- 20260618020000 le dio ese grant a has_telefonos_global_scope a proposito. El agujero real
-- ahi es anon, y es lo unico que se les saca.
--
-- NO se tocan en esta tanda: leadgen_agent_stats, operations_dashboard_kpis,
-- pick_discovery_seeds y scouter_enqueue_autopilot_batch. Las llama el front y no tienen
-- control interno, asi que el revoke no alcanza: necesitan un gate ADENTRO. Van aparte.
--
-- Resultado medido: las funciones definer sin gate alcanzables por anon pasaron de 99 a 37,
-- y las que ademas ESCRIBEN de 31 a 1 (scouter_enqueue_autopilot_batch, que queda pendiente).
-- De las 37 restantes, ~25 son los gate-helpers que usan las policies y no se pueden tocar,
-- y una es get_agenda_by_share_token, que es publica a proposito.

revoke execute on function public.api_hubstaff_daily(_from date, _to date, _profile_id uuid, _limit integer, _offset integer) from public, anon, authenticated;
revoke execute on function public.blu_match_creator(p_blu_name text) from public, anon, authenticated;
revoke execute on function public.chatter_assignment_day(_identity uuid, _dia date) from public, anon, authenticated;
revoke execute on function public.chatter_expected_sales(_identity uuid, _dia date, _dias integer) from public, anon, authenticated;
revoke execute on function public.chatter_model_backfill_tick(_dias integer, _modelos_por_llamada integer, _llamadas integer) from public, anon, authenticated;
revoke execute on function public.chatter_model_baseline(_blu_model_id bigint, _hasta date) from public, anon, authenticated;
revoke execute on function public.chatter_model_baseline(_blu_model_id bigint, _hasta date, _dias integer) from public, anon, authenticated;
revoke execute on function public.chatter_model_baseline(_blu_model_id bigint, _hasta date, _dias integer, _agency text) from public, anon, authenticated;
revoke execute on function public.chatter_models_of_day(_identity uuid, _dia date) from public, anon, authenticated;
revoke execute on function public.chatter_ventas_del_dia(_identity uuid, _dia date) from public, anon, authenticated;
revoke execute on function public.check_closer_contact_alerts() from public, anon, authenticated;
revoke execute on function public.claim_whatsapp_verification_code(p_code text, p_lid text, p_push_name text) from public, anon, authenticated;
revoke execute on function public.closer_calls_count(p_closer_id uuid, p_since date) from public, anon, authenticated;
revoke execute on function public.closer_closed_calls(p_closer_id uuid, p_since date) from public, anon, authenticated;
revoke execute on function public.corte_hubstaff_bloque(p_group_id uuid) from public, anon, authenticated;
revoke execute on function public.corte_jornada_bloque(p_group_id uuid) from public, anon, authenticated;
revoke execute on function public.corte_ventas_bloque() from public, anon, authenticated;
revoke execute on function public.crm_movements_in_range(p_from timestamp with time zone, p_to timestamp with time zone) from public, anon, authenticated;
revoke execute on function public.gen_cowork_join_code() from public, anon, authenticated;
revoke execute on function public.gen_meet_code() from public, anon, authenticated;
revoke execute on function public.get_closer_stage_counts(_user_id uuid, _is_admin boolean) from public, anon, authenticated;
revoke execute on function public.get_closer_stage_counts(p_assigned_to uuid) from public, anon, authenticated;
revoke execute on function public.get_lead_outcomes_de_origen(p_tenant uuid, p_query text, p_days integer) from public, anon, authenticated;
revoke execute on function public.has_telefonos_global_scope(_user_id uuid) from public, anon;
revoke execute on function public.hubstaff_activity_summary(p_from date, p_to date, p_person text) from public, anon, authenticated;
revoke execute on function public.hubstaff_entry_exit(p_from date, p_to date, p_person text) from public, anon, authenticated;
revoke execute on function public.hubstaff_projects_by_member(p_from date, p_to date) from public, anon, authenticated;
revoke execute on function public.is_livekit_room_owner(_user_id uuid, _room text) from public, anon;
revoke execute on function public.is_project_member(_user_id uuid, _project_id uuid) from public, anon, authenticated;
revoke execute on function public.next_ticket_code(p_form_id uuid) from public, anon, authenticated;
revoke execute on function public.recalculate_qa_call_participants(p_call_id uuid) from public, anon, authenticated;
revoke execute on function public.recordar_horarios_pendientes() from public, anon, authenticated;
revoke execute on function public.resolve_wa_name(p_closer_creator_id uuid, p_phone text) from public, anon, authenticated;
revoke execute on function public.resolve_wa_name(p_contact_id uuid) from public, anon, authenticated;
revoke execute on function public.retry_pending_qa_report_emails() from public, anon, authenticated;
revoke execute on function public.retry_stuck_qa_analyses() from public, anon, authenticated;
revoke execute on function public.role_group_members() from public, anon, authenticated;
revoke execute on function public.run_whatsapp_followup_tick() from public, anon, authenticated;
revoke execute on function public.scouter_rank_leads_for_spammer(p_tenant_id uuid, p_spammer_id uuid, p_cooldown_days integer, p_batch_size integer) from public, anon, authenticated;
revoke execute on function public.scouter_route_lead(p_lead_id uuid) from public, anon, authenticated;
revoke execute on function public.scouter_top_seed_match(p_lead_id uuid) from public, anon, authenticated;
revoke execute on function public.search_creators_fuzzy(p_q text) from public, anon, authenticated;
revoke execute on function public.tg_assign_conversation(p_conversation_id uuid, p_assignee uuid) from public, anon, authenticated;
revoke execute on function public.wa_assign_conversation(p_conversation_id uuid, p_assignee uuid) from public, anon, authenticated;
revoke execute on function public.wa_bump_unread(p_conversation_id uuid, p_preview text, p_sent_at timestamp with time zone) from public, anon, authenticated;
revoke execute on function public.whatsapp_bump_commitment_followup(p_id uuid) from public, anon, authenticated;
revoke execute on function public.whatsapp_group_in_business_hours(p_group_id uuid) from public, anon, authenticated;
revoke execute on function public.whatsapp_pending_reminders(p_limit integer) from public, anon, authenticated;
revoke execute on function public.whatsapp_resolve_user_by_lid(p_lid text) from public, anon, authenticated;
revoke execute on function public.whatsapp_resolve_user_by_phone(p_jid_or_phone text) from public, anon, authenticated;
revoke execute on function public.whatsapp_resolve_user_by_push_name(p_push_name text) from public, anon, authenticated;
