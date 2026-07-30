-- =============================================================================
-- create_recruitment_deal_for_creator: normalizar el handle al copiarlo.
-- -----------------------------------------------------------------------------
-- Bug encontrado en el import de EX MODELOS KASH (2026-07-30): `creators`
-- guarda algunos instagram_handle como URL COMPLETA
-- ("https://www.instagram.com/brendolla/", " https://...elifantasyoficial") y el
-- RPC los copiaba tal cual. Dos consecuencias:
--   1. El lead quedaba con "@https://www.instagram.com/brendolla/" como handle
--      → se veía roto en la tabla de Closers (reporte con screenshot).
--   2. PEOR: el lookup de "fila abierta del mismo handle" comparaba el handle
--      SUCIO contra los handles limpios de closer_creators → NO matcheaba y
--      creaba un DUPLICADO, esquivando sin querer el backstop
--      uq_closer_creators_open_handle (que compara strings, y los strings
--      difieren). Se generaron 2 duplicados reales (brendolla, brandybunnybunz),
--      ya mergeados a mano contra la fila original.
--
-- Fix: normalizar (quitar URL de instagram, espacios, @, /) ANTES de buscar y de
-- insertar. Así el lookup matchea y el handle guardado queda limpio.
-- =============================================================================

create or replace function public.create_recruitment_deal_for_creator(
  p_creator_id uuid,
  p_closer_id uuid default null,
  p_estimated_monetization numeric default 0,
  p_agency_commission numeric default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_creator public.creators%rowtype;
  v_handle  text;
  v_deal_id uuid;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'Permiso denegado: Closers / Asignar Closer.' using errcode = '42501';
  end if;

  select * into v_creator from public.creators where id = p_creator_id;
  if not found then
    raise exception 'Creadora no encontrada.' using errcode = 'P0002';
  end if;

  -- Normalización: creators puede traer la URL completa de Instagram.
  v_handle := coalesce(
    nullif(
      lower(regexp_replace(
        regexp_replace(trim(coalesce(v_creator.instagram_handle, '')), '^https?://(www\.)?instagram\.com/', '', 'i'),
        '[/@?[:space:]]', '', 'g'
      )),
      ''
    ),
    nullif(trim(coalesce(v_creator.name, '')), ''),
    'sin_handle'
  );

  -- Fila ABIERTA del mismo handle → promover, nunca duplicar. Se normalizan
  -- AMBOS lados: sin esto un handle-URL no matcheaba y se colaba un duplicado.
  if lower(v_handle) <> 'sin_handle' then
    select id into v_deal_id
    from public.closer_creators
    where lower(regexp_replace(
            regexp_replace(trim(coalesce(instagram_handle, '')), '^https?://(www\.)?instagram\.com/', '', 'i'),
            '[/@?[:space:]]', '', 'g'
          )) = v_handle
      and stage in ('Nuevo', 'Asignada', 'Confirmada')
    order by created_at asc
    limit 1;
  end if;

  if v_deal_id is not null then
    update public.closer_creators
      set assigned_to = coalesce(p_closer_id, assigned_to),
          stage = case when p_closer_id is not null and stage = 'Nuevo' then 'Asignada' else stage end,
          passed_date = case when p_closer_id is not null then coalesce(passed_date, current_date) else passed_date end,
          estimated_monetization = case
            when coalesce(estimated_monetization, 0) = 0 and coalesce(p_estimated_monetization, 0) > 0
              then p_estimated_monetization else estimated_monetization end,
          agency_commission = case
            when coalesce(agency_commission, 0) = 0 and coalesce(p_agency_commission, 0) > 0
              then p_agency_commission else agency_commission end,
          model_id = coalesce(model_id, v_creator.model_id),
          lead_source = case when lead_source = 'maven' then 'ex_creadora' else lead_source end
    where id = v_deal_id;
    return v_deal_id;
  end if;

  insert into public.closer_creators (
    instagram_handle, phone, category, model_id,
    deal_type, lead_source,
    assigned_to, stage, passed_date, created_by,
    estimated_monetization, agency_commission
  ) values (
    v_handle,
    coalesce(v_creator.phone_e164, v_creator.phone),
    v_creator.category,
    v_creator.model_id,
    'reclutamiento',
    'ex_creadora',
    p_closer_id,
    case when p_closer_id is not null then 'Asignada' else 'Nuevo' end,
    case when p_closer_id is not null then current_date else null end,
    auth.uid(),
    coalesce(p_estimated_monetization, 0),
    coalesce(p_agency_commission, 0)
  ) returning id into v_deal_id;

  return v_deal_id;
end;
$function$;
