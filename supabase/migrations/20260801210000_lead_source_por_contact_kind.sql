-- El lead que nace de un contacto no heredaba la BASE del contacto.
--
-- Los dos únicos caminos que crean filas en closer_creators desde un contacto
-- ignoraban `contact_kind`, así que TODO terminaba como 'maven'/'reclutamiento':
--
--   1. assign_closer_to_contact (botón Tomar / Asignar): sólo distinguía
--      'agencia'; una ex_creadora caía en el else y se guardaba como 'maven'.
--   2. sync_closers_contact_to_creators (trigger de alta de contacto): inserta
--      sin lead_source ni deal_type → agarra los defaults maven/reclutamiento.
--
-- Efecto medido el 01/08: 0 filas con lead_source='ex_creadora' pese a 67
-- derivadas de contactos ex_creadora, y 72 agencias metidas en el pool de
-- reclutamiento de MODELOS (son B2B: se les vende producto, no se las recluta).
-- Consecuencia para el bot de WhatsApp: sus tools leen lead_source, así que
-- respondía "maven" para todo y no reconocía de qué base venía cada lead.

-- ── 1. El RPC deriva la base del contact_kind ────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_closer_to_contact(p_contact_id uuid, p_closer_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_creator_id uuid;
  v_contact public.closers_contacts%rowtype;
  v_handle text;
  v_kind text;
  v_is_agencia boolean;
  v_lead_source text;
  v_deal_type text;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'No tenés permiso para asignar closers (Closers / Asignar Closer).'
      using errcode = '42501';
  end if;

  select * into v_contact from public.closers_contacts where id = p_contact_id;
  if not found then
    raise exception 'Contacto no encontrado.' using errcode = 'P0002';
  end if;

  v_handle := coalesce(nullif(v_contact.handle, ''), nullif(v_contact.name, ''), 'sin_handle');

  -- La BASE sale del tipo de contacto, no de un if binario. 'ex_creadora' ya no
  -- cae en el else: es reclutamiento igual que 'maven' (mismo embudo, para Kash)
  -- pero se distingue para poder verla, contarla y que el bot sepa de dónde vino.
  -- Una agencia es B2B: se le vende producto y vive fuera del embudo de modelos.
  v_kind := coalesce(v_contact.contact_kind, 'modelo');
  v_is_agencia := v_kind = 'agencia';
  v_lead_source := case v_kind when 'agencia' then 'agencia'
                               when 'ex_creadora' then 'ex_creadora'
                               else 'maven' end;
  v_deal_type   := case when v_is_agencia then 'venta_plataforma' else 'reclutamiento' end;

  select id into v_creator_id
  from public.closer_creators
  where source_contact_id = p_contact_id
    and deal_type = v_deal_type;

  if v_creator_id is null and lower(v_handle) <> 'sin_handle' then
    select id into v_creator_id
    from public.closer_creators
    where lower(instagram_handle) = lower(v_handle)
      and stage in ('Nuevo', 'Asignada', 'Confirmada')
    order by created_at asc
    limit 1;
  end if;

  if v_creator_id is not null then
    update public.closer_creators
    set assigned_to = p_closer_id,
        stage       = case when stage = 'Nuevo' then 'Asignada' else stage end,
        passed_date = coalesce(passed_date, current_date),
        source_contact_id = coalesce(source_contact_id, p_contact_id),
        phone       = coalesce(phone, v_contact.phone),
        -- Si la fila venía del pool marcada 'maven' (el default) y el contacto
        -- dice otra cosa, se corrige. Antes esto sólo cubría agencias.
        lead_source = case when lead_source = 'maven' and v_lead_source <> 'maven'
                          then v_lead_source else lead_source end,
        -- Una agencia mal quedada como 'reclutamiento' también se corrige: si no,
        -- el primer lookup (por source_contact_id + deal_type) nunca la encuentra
        -- y cada asignación vuelve a resolverse por handle.
        deal_type   = case when v_is_agencia then 'venta_plataforma' else deal_type end
    where id = v_creator_id;
  else
    insert into public.closer_creators (
      instagram_handle, phone, category, source_contact_id,
      assigned_to, stage, passed_date, created_by,
      lead_source, deal_type, city
    ) values (
      v_handle,
      v_contact.phone,
      v_contact.physical_appearance,
      p_contact_id,
      p_closer_id,
      'Asignada',
      current_date,
      auth.uid(),
      v_lead_source,
      v_deal_type,
      v_contact.city
    )
    returning id into v_creator_id;
  end if;

  update public.closers_contacts set status = 'converted' where id = p_contact_id;

  return v_creator_id;
end;
$function$;

-- ── 2. El trigger de alta respeta el tipo de contacto ────────────────────────
CREATE OR REPLACE FUNCTION public.sync_closers_contact_to_creators()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_kind text := coalesce(NEW.contact_kind, 'modelo');
BEGIN
  -- Sólo sincroniza si el contacto tiene teléfono
  IF NEW.phone IS NULL OR trim(NEW.phone) = '' THEN
    RETURN NEW;
  END IF;

  -- LAS AGENCIAS NO ENTRAN AL EMBUDO DE MODELOS. Son otra línea de negocio (B2B)
  -- y su tab las lee del DIRECTORIO de contactos; su fila de pipeline nace recién
  -- cuando un closer la toma (assign_closer_to_contact). Crearla acá metía 464
  -- empresas al pool de "Nuevas" junto a las creadoras por reclutar, y además las
  -- duplicaba en su propio tab (fila de lead + contacto sin convertir).
  IF v_kind = 'agencia' THEN
    RETURN NEW;
  END IF;

  -- Salta si el handle ya existe en la tabla oficial de creators
  IF EXISTS (
    SELECT 1 FROM public.creators
    WHERE lower(trim(both '@' from instagram_handle)) = lower(trim(both '@' from NEW.handle))
  ) THEN
    RETURN NEW;
  END IF;

  -- Salta si ya se sincronizó
  IF EXISTS (
    SELECT 1 FROM public.closer_creators WHERE source_contact_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.closer_creators (
    instagram_handle, source_account, category, phone, notes,
    stage, estimated_monetization, agency_commission, created_by, source_contact_id,
    lead_source
  ) VALUES (
    NEW.handle, NEW.company, NEW.physical_appearance, NEW.phone, NEW.notes,
    'Nuevo', 0, 0, NEW.created_by, NEW.id,
    -- Antes no se pasaba y agarraba el default 'maven'. Una ex_creadora SÍ va al
    -- embudo de modelos (es reclutamiento para Kash), pero etiquetada como tal.
    CASE WHEN v_kind = 'ex_creadora' THEN 'ex_creadora' ELSE 'maven' END
  );
  RETURN NEW;
EXCEPTION WHEN unique_violation THEN
  RETURN NEW;
END;
$function$;

-- ── 3. Corregir lo ya guardado ───────────────────────────────────────────────
-- Las derivadas de contactos ex_creadora que quedaron como 'maven'. NO cambia en
-- qué tabs aparecen (el embudo de modelos sólo excluye 'agencia'), sólo las hace
-- identificables: para el closer, para los conteos y para el bot.
CREATE TABLE IF NOT EXISTS closer_creators_backup_excreadoras_20260801 AS
SELECT cc.* FROM closer_creators cc
JOIN closers_contacts c ON c.id = cc.source_contact_id
WHERE c.contact_kind = 'ex_creadora' AND cc.lead_source = 'maven';

UPDATE closer_creators cc
SET lead_source = 'ex_creadora'
FROM closers_contacts c
WHERE c.id = cc.source_contact_id
  AND c.contact_kind = 'ex_creadora'
  AND cc.lead_source = 'maven';
