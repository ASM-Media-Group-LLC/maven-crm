-- Opción "Kash" en el carrito de CONTACTOS: espejo de
-- create_recruitment_deal_for_creator pero partiendo de closers_contacts.
-- El contacto entra al pipeline como RECLUTAMIENTO (comisión % sobre su
-- monetización), no como suscripción. Antes desde Contactos sólo se podía vender
-- plataforma o asignar closer "a secas" (sin monetización ni %).
create or replace function public.create_recruitment_deal_for_contact(
  p_contact_id uuid,
  p_closer_id uuid default null,
  p_estimated_monetization numeric default null,
  p_agency_commission numeric default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_contact public.closers_contacts%rowtype;
  v_handle text;
  v_kind text;
  v_lead_source text;
  v_deal_id uuid;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'Permiso denegado: Closers / Asignar Closer.' using errcode = '42501';
  end if;

  select * into v_contact from public.closers_contacts where id = p_contact_id;
  if not found then
    raise exception 'Contacto no encontrado.' using errcode = 'P0002';
  end if;

  v_kind := coalesce(v_contact.contact_kind, 'modelo');
  -- Una agencia es B2B: se le VENDE producto, no se la recluta como modelo.
  if v_kind = 'agencia' then
    raise exception 'Una agencia no se recluta para Kash: usá la venta de plataforma.'
      using errcode = '22023';
  end if;

  v_handle := coalesce(nullif(v_contact.handle, ''), nullif(v_contact.name, ''), 'sin_handle');
  -- Si ya fue creadora, el lead nace en la base Ex-creadores.
  v_lead_source := case when v_kind = 'ex_creadora' then 'ex_creadora' else 'maven' end;

  -- uq_closer_creators_open_handle: una sola fila ABIERTA por handle. Hay que
  -- PROMOVER la existente; insertar acá reventaría con violación de único.
  select id into v_deal_id
  from public.closer_creators
  where source_contact_id = p_contact_id and deal_type = 'reclutamiento'
  limit 1;

  if v_deal_id is null and lower(v_handle) <> 'sin_handle' then
    select id into v_deal_id
    from public.closer_creators
    where lower(instagram_handle) = lower(v_handle)
      and stage in ('Nuevo', 'Asignada', 'Confirmada')
    order by created_at asc
    limit 1;
  end if;

  if v_deal_id is not null then
    update public.closer_creators
    set deal_type   = 'reclutamiento',
        assigned_to = coalesce(p_closer_id, assigned_to),
        stage       = case when stage = 'Nuevo' and p_closer_id is not null then 'Asignada' else stage end,
        passed_date = coalesce(passed_date, current_date),
        source_contact_id = coalesce(source_contact_id, p_contact_id),
        phone       = coalesce(phone, v_contact.phone),
        estimated_monetization = coalesce(p_estimated_monetization, estimated_monetization),
        agency_commission      = coalesce(p_agency_commission, agency_commission),
        lead_source = case when lead_source = 'maven' then v_lead_source else lead_source end
    where id = v_deal_id;
  else
    insert into public.closer_creators (
      instagram_handle, phone, category, source_contact_id,
      assigned_to, stage, passed_date, created_by,
      lead_source, deal_type, city,
      estimated_monetization, agency_commission
    ) values (
      v_handle, v_contact.phone, v_contact.physical_appearance, p_contact_id,
      p_closer_id,
      case when p_closer_id is not null then 'Asignada' else 'Nuevo' end,
      case when p_closer_id is not null then current_date else null end,
      auth.uid(),
      v_lead_source, 'reclutamiento', v_contact.city,
      coalesce(p_estimated_monetization, 0), coalesce(p_agency_commission, 0)
    ) returning id into v_deal_id;
  end if;

  update public.closers_contacts set status = 'converted' where id = p_contact_id;
  return v_deal_id;
end;
$function$;

grant execute on function public.create_recruitment_deal_for_contact(uuid, uuid, numeric, numeric) to authenticated;
