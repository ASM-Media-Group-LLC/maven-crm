-- Feature: venta de plataformas a creadoras existentes DENTRO del pipeline de closers.
--
-- Contexto: `closer_creators` nació solo para RECLUTAR (economía = estimated_monetization
-- × agency_commission%). Ahora se le vende una plataforma (Blu, Let's Shoot, etc.) a una
-- creadora que YA es de la agencia; en ese caso NO hay % de comisión: la creadora paga una
-- SUSCRIPCIÓN MENSUAL fija. Modelamos ambos tipos en la misma tabla con un discriminador.
--
-- Slice 1 (backend). El frontend (botón "Vender plataforma" en Creadoras + UI condicional
-- en el pipeline) va en slices aparte.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Discriminador de tipo de deal + economía por suscripción
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.closer_creators
  ADD COLUMN IF NOT EXISTS deal_type text NOT NULL DEFAULT 'reclutamiento',
  ADD COLUMN IF NOT EXISTS subscription_amount numeric;

COMMENT ON COLUMN public.closer_creators.deal_type IS
  'reclutamiento = captar creadora a la agencia (comisión % sobre OF). venta_plataforma = venderle una plataforma a una creadora existente (paga subscription_amount mensual).';
COMMENT ON COLUMN public.closer_creators.subscription_amount IS
  'Monto MENSUAL que la creadora paga por la plataforma vendida (solo deal_type=venta_plataforma). En reclutamiento la economía sigue en estimated_monetization × agency_commission.';

ALTER TABLE public.closer_creators
  DROP CONSTRAINT IF EXISTS closer_creators_deal_type_check;
ALTER TABLE public.closer_creators
  ADD CONSTRAINT closer_creators_deal_type_check
  CHECK (deal_type IN ('reclutamiento', 'venta_plataforma'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) UNIQUE(source_contact_id) → índice único PARCIAL (solo reclutamiento).
--    Así una creadora puede tener su reclutamiento histórico + N deals de venta.
--    Los deals de venta se ligan por model_id y usan source_contact_id = NULL.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.closer_creators
  DROP CONSTRAINT IF EXISTS closer_creators_source_contact_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS closer_creators_source_contact_id_recruit_key
  ON public.closer_creators (source_contact_id)
  WHERE deal_type = 'reclutamiento' AND source_contact_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Proteger los deals de venta de los triggers de exclusión por handle.
--    cleanup_closer_on_creator_insert borra leads stage='Nuevo' al insertarse una
--    creadora; hay que exceptuar los deals de venta (que por diseño existen JUNTO
--    a la creadora). Resto del cuerpo idéntico al vigente.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_closer_on_creator_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.closers_contacts SET status = 'converted'
  WHERE lower(trim(both '@' from handle)) = lower(trim(both '@' from NEW.instagram_handle))
    AND status IS DISTINCT FROM 'converted';

  DELETE FROM public.closer_creators
  WHERE stage = 'Nuevo' AND leadgen_entry_id IS NULL
    AND deal_type = 'reclutamiento'
    AND lower(trim(both '@' from instagram_handle)) = lower(trim(both '@' from NEW.instagram_handle));

  RETURN NEW;
END;
$function$;

-- Mi trigger de sync de status: los deals de venta NO deben mover el status del
-- contacto (el contacto es de reclutamiento). Además usan source_contact_id NULL,
-- pero el guard explícito lo deja a prueba de balas.
CREATE OR REPLACE FUNCTION public.sync_contact_status_from_closer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source_contact_id IS NULL OR NEW.deal_type <> 'reclutamiento' THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    UPDATE public.closers_contacts
      SET status = 'converted'
      WHERE id = NEW.source_contact_id
        AND coalesce(status, '') <> 'converted';
  ELSIF NEW.stage = 'Nuevo' THEN
    UPDATE public.closers_contacts
      SET status = 'new'
      WHERE id = NEW.source_contact_id
        AND status = 'converted';
  END IF;

  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RPC para crear un deal de venta de plataforma a una creadora existente.
--    Ligado por model_id (estable). Si p_closer_id viene, entra asignado; si no,
--    entra al pool ('Nuevo') para que un closer lo tome. Idempotente por
--    (creadora, plataforma) mientras el deal esté abierto.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_platform_deal_for_creator(
  p_creator_id uuid,
  p_platform text,
  p_subscription_amount numeric,
  p_closer_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_creator public.creators%rowtype;
  v_deal_id uuid;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'Permiso denegado: Closers / Asignar Closer.' using errcode = '42501';
  end if;

  select * into v_creator from public.creators where id = p_creator_id;
  if not found then
    raise exception 'Creadora no encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(trim(p_platform), '') = '' then
    raise exception 'Plataforma requerida.' using errcode = '22004';
  end if;

  -- ¿Ya hay un deal de venta ABIERTO para esta creadora + plataforma? Reusar.
  select id into v_deal_id
  from public.closer_creators
  where deal_type = 'venta_plataforma'
    and stage not in ('Completada', 'No interesada')
    and lower(coalesce(main_platform, '')) = lower(p_platform)
    and (
      (v_creator.model_id is not null and model_id = v_creator.model_id)
      or lower(trim(both '@' from instagram_handle)) = lower(trim(both '@' from coalesce(v_creator.instagram_handle, '')))
    )
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
    deal_type, subscription_amount, model_id,
    assigned_to, stage, passed_date, created_by,
    estimated_monetization, agency_commission
  ) values (
    coalesce(nullif(v_creator.instagram_handle, ''), nullif(v_creator.name, ''), 'sin_handle'),
    coalesce(v_creator.phone_e164, v_creator.phone),
    v_creator.category,
    p_platform,
    'venta_plataforma',
    p_subscription_amount,
    v_creator.model_id,
    p_closer_id,
    case when p_closer_id is not null then 'Asignada' else 'Nuevo' end,
    case when p_closer_id is not null then current_date else null end,
    auth.uid(),
    0, 0
  ) returning id into v_deal_id;

  return v_deal_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.create_platform_deal_for_creator(uuid, text, numeric, uuid) TO authenticated;
