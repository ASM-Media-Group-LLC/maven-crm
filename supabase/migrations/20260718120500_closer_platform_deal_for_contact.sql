-- =============================================================================
-- "Vender plataforma" desde CONTACTOS (paridad con el botón de Creadoras).
-- -----------------------------------------------------------------------------
-- Ya existe create_platform_deal_for_creator (entrada desde Creadoras). El owner
-- quiere el MISMO carrito en Contactos: mandar un contacto (closers_contacts) al
-- pipeline de closers como deal de venta de plataforma (suscripción mensual, sin
-- comisión %).
--
-- A diferencia de la variante de creadora (que liga por model_id y deja
-- source_contact_id NULL), acá SÍ ligamos por source_contact_id → el índice
-- único parcial closer_creators_source_contact_id_recruit_key solo aplica a
-- deal_type='reclutamiento', así que un contacto puede tener a la vez su fila de
-- reclutamiento y N deals de venta. El trigger sync_contact_status_from_closer ya
-- ignora los deals de venta (guard deal_type<>'reclutamiento'), así que crear un
-- deal de venta NO marca el contacto como 'converted'.
--
-- Additive. Gateado por el MISMO permiso que el carrito de Creadoras
-- (Closers / Asignar Closer). Reversible (drop de la función).
-- =============================================================================

create or replace function public.create_platform_deal_for_contact(
  p_contact_id uuid,
  p_platform text,
  p_subscription_amount numeric,
  p_closer_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_contact public.closers_contacts%rowtype;
  v_deal_id uuid;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'Permiso denegado: Closers / Asignar Closer.' using errcode = '42501';
  end if;

  select * into v_contact from public.closers_contacts where id = p_contact_id;
  if not found then
    raise exception 'Contacto no encontrado.' using errcode = 'P0002';
  end if;

  if coalesce(trim(p_platform), '') = '' then
    raise exception 'Plataforma requerida.' using errcode = '22004';
  end if;

  -- ¿Ya hay un deal de venta ABIERTO para este contacto + plataforma? Reusar.
  select id into v_deal_id
  from public.closer_creators
  where deal_type = 'venta_plataforma'
    and stage not in ('Completada', 'No interesada')
    and source_contact_id = p_contact_id
    and lower(coalesce(main_platform, '')) = lower(p_platform)
  limit 1;

  if v_deal_id is not null then
    update public.closer_creators
      set subscription_amount = coalesce(p_subscription_amount, subscription_amount),
          assigned_to = coalesce(p_closer_id, assigned_to),
          stage = case when p_closer_id is not null and stage = 'Nuevo' then 'Asignada' else stage end,
          passed_date = case when p_closer_id is not null then coalesce(passed_date, current_date) else passed_date end
    where id = v_deal_id;
    return v_deal_id;
  end if;

  insert into public.closer_creators (
    instagram_handle, phone, category, main_platform,
    deal_type, subscription_amount, source_contact_id,
    assigned_to, stage, passed_date, created_by,
    estimated_monetization, agency_commission
  ) values (
    coalesce(nullif(v_contact.handle, ''), nullif(v_contact.name, ''), 'sin_handle'),
    v_contact.phone,
    v_contact.physical_appearance,
    p_platform,
    'venta_plataforma',
    p_subscription_amount,
    p_contact_id,
    p_closer_id,
    case when p_closer_id is not null then 'Asignada' else 'Nuevo' end,
    case when p_closer_id is not null then current_date else null end,
    auth.uid(),
    0, 0
  ) returning id into v_deal_id;

  return v_deal_id;
end;
$function$;

grant execute on function public.create_platform_deal_for_contact(uuid, text, numeric, uuid) to authenticated;
revoke execute on function public.create_platform_deal_for_contact(uuid, text, numeric, uuid) from anon, public;

-- Endurecer assign_closer_to_contact (reclutamiento): su chequeo de existencia
-- buscaba por source_contact_id SIN filtrar deal_type. Ahora que un contacto
-- puede tener también deals de venta ligados por source_contact_id, ese SELECT
-- podía agarrar por error el deal de VENTA y reasignarlo en vez de crear la fila
-- de reclutamiento. Filtramos deal_type='reclutamiento' → cada camino toca solo
-- su tipo.
create or replace function public.assign_closer_to_contact(p_contact_id uuid, p_closer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_contact public.closers_contacts%rowtype;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'No tenés permiso para asignar closers (Closers / Asignar Closer).'
      using errcode = '42501';
  end if;

  select * into v_contact from public.closers_contacts where id = p_contact_id;
  if not found then
    raise exception 'Contacto no encontrado.' using errcode = 'P0002';
  end if;

  select id into v_creator_id
  from public.closer_creators
  where source_contact_id = p_contact_id
    and deal_type = 'reclutamiento';

  if v_creator_id is not null then
    update public.closer_creators
    set assigned_to = p_closer_id,
        stage       = case when stage = 'Nuevo' then 'Asignada' else stage end,
        passed_date = coalesce(passed_date, current_date)
    where id = v_creator_id;
  else
    insert into public.closer_creators (
      instagram_handle, phone, category, source_contact_id,
      assigned_to, stage, passed_date, created_by
    ) values (
      coalesce(nullif(v_contact.handle, ''), nullif(v_contact.name, ''), 'sin_handle'),
      v_contact.phone,
      v_contact.physical_appearance,
      p_contact_id,
      p_closer_id,
      'Asignada',
      current_date,
      auth.uid()
    )
    returning id into v_creator_id;
  end if;

  update public.closers_contacts set status = 'converted' where id = p_contact_id;

  return v_creator_id;
end;
$$;

notify pgrst, 'reload schema';
