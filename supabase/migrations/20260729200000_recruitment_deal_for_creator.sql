-- =============================================================================
-- Camino NATIVO para que una creadora existente vuelva al pipeline de closers
-- como RECLUTAMIENTO (no como venta de plataforma).
-- -----------------------------------------------------------------------------
-- Decisión del owner (2026-07-29): en el carrito de Creadoras se agrega "Kash"
-- (= la agencia). Si eligen Kash, la creadora entra al pipeline "de la forma
-- normal", es decir como deal_type='reclutamiento' con monetización estimada y
-- % de comisión — no con suscripción mensual.
--
-- POR QUÉ HACÍA FALTA: no existía ningún camino nativo "ex-creadora → lead de
-- reclutamiento". Los que había hacen otra cosa:
--   · reactivate_creator (#945): la devuelve al ROSTER en 'onboarding' — asume
--     que ya dijo sí, no la pone a trabajar en el pipeline.
--   · create_platform_deal_for_creator: la manda al pipeline pero como
--     'venta_plataforma' (suscripción), no como reclutamiento.
-- Y el diseño empuja en contra de insertarlo a mano: el trigger
-- cleanup_closer_on_creator_insert BORRA leads de reclutamiento 'Nuevo' de quien
-- ya es creadora. Con este RPC el camino queda explícito y auditado.
--
-- RESPETA el backstop uq_closer_creators_open_handle (una sola fila ABIERTA por
-- handle, del 2026-07-23): si ya existe una fila abierta de ese handle la
-- PROMUEVE en vez de insertar otra — mismo patrón que assign_closer_to_creator.
-- Sin eso el INSERT explotaría con violación de índice único.
--
-- OJO AL CIERRE: si la creadora sigue en el roster (status leaving/paused/
-- terminated), al cerrar el lead NO se usa "Convertir a Creadora"
-- (convert_contact_to_creator falla con creator_already_exists para status no
-- terminated) — se usa reactivate_creator. El frontend lo refleja.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Origen del lead. Base para los tabs nuevos (Ex-creadores / Agencias) y para
-- que los bots de WhatsApp sepan de qué base viene cada lead.
--   'maven'       → entró por Maven (LeadGen, Contactos, scouting) = TODO lo
--                   existente, así que el default no cambia ningún comportamiento.
--   'ex_creadora' → viene de la base "EX MODELOS KASH".
--   'agencia'     → viene de la base de agencias (B2B).
-- Additive: default 'maven' + NOT NULL → las ~2.5k filas actuales quedan como
-- 'maven' y ninguna query existente cambia de resultado.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.closer_creators
  add column if not exists lead_source text not null default 'maven';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'closer_creators_lead_source_check'
  ) then
    alter table public.closer_creators
      add constraint closer_creators_lead_source_check
      check (lead_source in ('maven', 'ex_creadora', 'agencia'));
  end if;
end $$;

create index if not exists closer_creators_lead_source_idx
  on public.closer_creators (lead_source)
  where lead_source <> 'maven';

comment on column public.closer_creators.lead_source is
  'De qué base viene el lead: maven (LeadGen/Contactos/scouting, default) · ex_creadora (base EX MODELOS KASH) · agencia (base B2B de agencias). Alimenta los tabs de Closers y el contexto que ven los bots de WhatsApp.';

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
  -- Mismo gate que el carrito de venta de plataforma.
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'Permiso denegado: Closers / Asignar Closer.' using errcode = '42501';
  end if;

  select * into v_creator from public.creators where id = p_creator_id;
  if not found then
    raise exception 'Creadora no encontrada.' using errcode = 'P0002';
  end if;

  v_handle := coalesce(
    nullif(trim(both '@' from coalesce(v_creator.instagram_handle, '')), ''),
    nullif(v_creator.name, ''),
    'sin_handle'
  );

  -- ¿Ya hay una fila ABIERTA de este handle? Promover, nunca duplicar
  -- (uq_closer_creators_open_handle lo prohíbe a nivel BD).
  if lower(v_handle) <> 'sin_handle' then
    select id into v_deal_id
    from public.closer_creators
    where lower(trim(both '@' from instagram_handle)) = lower(v_handle)
      and stage in ('Nuevo', 'Asignada', 'Confirmada')
    order by created_at asc
    limit 1;
  end if;

  if v_deal_id is not null then
    update public.closer_creators
      set assigned_to = coalesce(p_closer_id, assigned_to),
          stage = case when p_closer_id is not null and stage = 'Nuevo' then 'Asignada' else stage end,
          passed_date = case when p_closer_id is not null then coalesce(passed_date, current_date) else passed_date end,
          -- Sólo rellena si venían vacíos: no pisa lo que el closer ya cargó.
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

grant execute on function public.create_recruitment_deal_for_creator(uuid, uuid, numeric, numeric) to authenticated;
revoke execute on function public.create_recruitment_deal_for_creator(uuid, uuid, numeric, numeric) from anon, public;

comment on function public.create_recruitment_deal_for_creator(uuid, uuid, numeric, numeric) is
  'Manda una creadora EXISTENTE al pipeline de closers como RECLUTAMIENTO (deal_type=reclutamiento, lead_source=ex_creadora). Es lo que dispara la opción "Kash" del carrito de Creadoras. Promueve la fila abierta del handle si ya existe (respeta uq_closer_creators_open_handle). Al cerrar usar reactivate_creator, NO convert_contact_to_creator.';
