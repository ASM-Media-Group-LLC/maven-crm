-- Enriquecer el drill-down de actividad de un closer: además de canal/resultado/notas,
-- traer contexto del lead (stage actual, categoría, monetización estimada) para que el
-- "tracking detallado" muestre de un vistazo con qué lead fue cada contacto.
-- Cambia el tipo de retorno → hay que DROP + CREATE (create or replace no permite cambiarlo).

drop function if exists public.get_closer_activity_detail(date, date, uuid);

create function public.get_closer_activity_detail(p_from date, p_to date, p_employee uuid)
returns table(
  contact_id    uuid,
  contact_date  timestamptz,
  lead_id       uuid,
  lead_handle   text,
  lead_stage    text,
  lead_category text,
  lead_monetization numeric,
  channel       text,
  result        text,
  notes         text,
  is_auto       boolean
)
language plpgsql stable security definer set search_path = public as $$
declare v_super boolean;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  v_super := public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager');
  -- un closer solo puede pedir su propio detalle
  if not v_super and p_employee is distinct from auth.uid() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select h.id, h.contact_date, h.creator_id, cc.instagram_handle,
         cc.stage, cc.category, cc.estimated_monetization,
         h.channel, h.result, h.notes, (coalesce(h.notes,'') = '(auto)')
  from public.closer_contact_history h
  join public.closer_creators cc on cc.id = h.creator_id
  where (h.contact_date at time zone 'America/Bogota')::date between p_from and p_to
    and h.created_by = p_employee
  order by h.contact_date desc;
end; $$;

revoke all on function public.get_closer_activity_detail(date, date, uuid) from public, anon;
grant execute on function public.get_closer_activity_detail(date, date, uuid) to authenticated;
