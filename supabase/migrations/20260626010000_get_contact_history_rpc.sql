-- Timeline/historial completo de un contacto (pantalla "Historial" del popup de Contactos).
-- Agrega: alta como contacto, origen LeadGen, cambios de categoría, pipeline del closer
-- (entrada/confirmada/completada/no-interesada/rechazada/notas), contactos hechos
-- (closer_contact_history + contact_interactions), conversión a creadora, asignación a
-- agencia, baja/offboarding y notas del perfil. SECURITY DEFINER para cruzar todo +
-- resolver nombres (profiles). Solo authenticated. La creadora se linkea por handle (IG).
create or replace function public.get_contact_history(p_contact_id uuid)
returns table(event_at timestamptz, kind text, title text, detail text)
language plpgsql stable security definer set search_path = public as $$
declare v_handle text;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
  select lower(regexp_replace(coalesce(handle,''),'^@','')) into v_handle
  from public.closers_contacts where id = p_contact_id;

  return query
  with nm as (select id, full_name from public.profiles),
  cc as (select * from public.closer_creators where source_contact_id = p_contact_id),
  cr as (select * from public.creators where v_handle <> '' and lower(regexp_replace(coalesce(instagram_handle,''),'^@','')) = v_handle)
  select c.created_at, 'alta',
    'Alta como contacto' || case when c.record_type = 'reactivado' then ' (reactivado)' else '' end,
    'Agente: ' || coalesce((select full_name from nm where id = c.created_by), '—')
      || case when c.company is not null then ' · Compañía: ' || c.company else '' end
  from public.closers_contacts c where c.id = p_contact_id
  union all
  select le.created_at, 'lead', 'Generado por LeadGen',
    coalesce('Calidad: ' || le.quality, '') || coalesce(' · ' || le.company, '')
  from public.closers_contacts c join public.leadgen_entries le on le.id = c.leadgen_entry_id where c.id = p_contact_id
  union all
  select ch.changed_at, 'cambio',
    'Cambió categoría: ' || coalesce(ch.old_category,'—') || ' → ' || coalesce(ch.new_category,'—'),
    'por ' || coalesce((select full_name from nm where id = ch.changed_by), '—')
  from public.contact_category_changes ch where ch.contact_id = p_contact_id
  union all
  select cc.created_at, 'pipeline', 'Entró al pipeline de closers',
    'Closer: ' || coalesce((select full_name from nm where id = cc.assigned_to), 'sin asignar') || ' · Etapa: ' || coalesce(cc.stage,'—') from cc
  union all
  select cc.confirmed_date, 'pipeline', 'Confirmada en el pipeline', null from cc where cc.confirmed_date is not null
  union all
  select cc.completed_date, 'pipeline', 'Completada en el pipeline', null from cc where cc.completed_date is not null
  union all
  select cc.no_interesada_date, 'baja', 'Marcada como No interesada', null from cc where cc.no_interesada_date is not null
  union all
  select cc.updated_at, 'pipeline', 'Rechazada', cc.rejection_reason from cc where cc.rejection_reason is not null
  union all
  select cc.updated_at, 'nota', 'Nota del closer (pipeline)', cc.notes from cc where cc.notes is not null and btrim(cc.notes) <> ''
  union all
  select h.contact_date, 'contactos', 'Contacto por ' || coalesce(h.channel,'—'),
    coalesce('Resultado: ' || h.result, '') || coalesce(' · ' || h.notes, '')
      || ' · por ' || coalesce((select full_name from nm where id = h.created_by), '—')
  from public.closer_contact_history h join cc on cc.id = h.creator_id
  union all
  select i.interaction_date, 'contactos', 'Interacción: ' || coalesce(i.interaction_type,'—'),
    coalesce(i.call_summary, i.notes) || coalesce(' · ' || i.resulting_status, '')
  from public.contact_interactions i where i.contact_id = p_contact_id
  union all
  select cr.created_at, 'conversion', 'Convertida a creadora',
    'Estado: ' || coalesce(cr.status,'—') || coalesce(' · Origen: ' || cr.source, '') from cr
  union all
  select cb.start_date, 'agencia', 'Asignada a agencia', 'Agencia: ' || coalesce(cb.assigned_agency,'—')
  from cr join public.creator_business cb on cb.creator_id = cr.id
  union all
  select coalesce(off.exit_date, off.created_at), 'baja', 'Dejó la agencia (offboarding)',
    'Estado: ' || coalesce(off.status,'—') || coalesce(' · Motivo: ' || off.motivo_final, '')
  from cr join public.creator_offboardings off on off.creator_id = cr.id
  union all
  select n.created_at, 'nota', 'Nota en perfil de creadora', n.note_text
  from cr join public.creator_notes n on n.creator_id = cr.id
  order by 1 asc nulls last;
end; $$;
revoke all on function public.get_contact_history(uuid) from public, anon;
grant execute on function public.get_contact_history(uuid) to authenticated;
