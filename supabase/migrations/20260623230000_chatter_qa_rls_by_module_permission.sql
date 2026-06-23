-- La data de Chatters QA (scorecards, qa_reports, section_feedback, config) es GLOBAL de la
-- agencia. Antes las 4 tablas gateaban por blu_is_management (admin/manager/owner), excluyendo
-- al rol "Chatter Supervisor" aunque tenga can_access('Agency QA','Chatters QA')=true → veía la
-- UI pero 0 filas y no guardaba config. Alineamos la RLS al permiso del MÓDULO: cualquier rol con
-- ese permiso ve/edita la MISMA data global (no per-usuario). Ya aplicado en prod vía MCP 2026-06-23.
create or replace function public.can_access_chatters_qa(p_uid uuid)
returns boolean
language sql stable security definer set search_path to 'public'
as $function$
  select
    public.blu_is_management(p_uid)
    or exists (
      select 1
      from public.user_roles ur
      join public.roles_config rc on rc.name = ur.role
      join public.role_permissions rp on rp.role_id = rc.id
      where ur.user_id = p_uid
        and rp.module = 'Agency QA'
        and rp.submodule = 'Chatters QA'
        and rp.can_access = true
    );
$function$;

alter policy chatter_scorecards_select on public.chatter_scorecards using (public.can_access_chatters_qa(auth.uid()));
alter policy chatter_scorecards_insert on public.chatter_scorecards with check (public.can_access_chatters_qa(auth.uid()));
alter policy chatter_scorecards_update on public.chatter_scorecards using (public.can_access_chatters_qa(auth.uid())) with check (public.can_access_chatters_qa(auth.uid()));
alter policy chatter_scorecards_delete on public.chatter_scorecards using (public.can_access_chatters_qa(auth.uid()));

alter policy chatter_qa_reports_select on public.chatter_qa_reports using (public.can_access_chatters_qa(auth.uid()));
alter policy chatter_qa_reports_insert on public.chatter_qa_reports with check (public.can_access_chatters_qa(auth.uid()));
alter policy chatter_qa_reports_update on public.chatter_qa_reports using (public.can_access_chatters_qa(auth.uid())) with check (public.can_access_chatters_qa(auth.uid()));
alter policy chatter_qa_reports_delete on public.chatter_qa_reports using (public.can_access_chatters_qa(auth.uid()));

alter policy chatter_qa_sfb_all on public.chatter_qa_section_feedback using (public.can_access_chatters_qa(auth.uid())) with check (public.can_access_chatters_qa(auth.uid()));
alter policy chatter_qa_config_rw on public.chatter_qa_config using (public.can_access_chatters_qa(auth.uid())) with check (public.can_access_chatters_qa(auth.uid()));
