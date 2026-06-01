-- =============================================================================
-- monetization_opportunities — oportunidades de venta de PRODUCTOS a creadoras
-- -----------------------------------------------------------------------------
-- Trackea el interés de una creadora en un producto (Piclink, Content Protector,
-- Blu, Exchange, ...) y su avance en el embudo:
--    interested -> offered -> negotiating -> won | lost
--
-- ¿Por qué existe? Alvaro pidió que el bot esté "más atento" a las oportunidades
-- de monetización y pueda decir "qué ventas hay cerca de completar", sin que se
-- lo recuerden. Hoy esas oportunidades viven sueltas en el chat y se pierden.
-- Esta tabla es la "memoria de oportunidades": el bot la llena (con data
-- verificada) y la persigue; los humanos la ven/manejan en la pantalla de Maven.
--
-- Es el equivalente, para venta de PLATAFORMAS, de lo que el pipeline de Closers
-- (closer_creators) ya hace para la firma de AGENCIA. Se vincula opcionalmente al
-- lead del pipeline (closer_creator_id) pero la clave humana inequívoca es el
-- @handle de la creadora (creator_handle).
--
-- Sin PII nueva: NO guarda teléfono (solo @handle). No requiere masking.
-- =============================================================================

create table if not exists public.monetization_opportunities (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default public.current_tenant_id(),
  creator_handle     text not null,                       -- @handle inequívoco de la creadora
  closer_creator_id  uuid references public.closer_creators(id) on delete set null, -- link opcional al lead del pipeline
  product            text not null,                       -- piclink / content_protector / blu / exchange / agency / other
  stage              text not null default 'interested'
                       check (stage in ('interested','offered','negotiating','won','lost')),
  assigned_to        uuid references auth.users(id) on delete set null,  -- quién la trabaja (closer/manager)
  last_touch_at      timestamptz not null default now(),  -- último contacto/avance
  next_followup_at   timestamptz,                         -- cuándo volver a tocarla (lo usa el seguimiento)
  notes              text,                                -- contexto libre (ej. "ofrecido Piclink gratis + CP con descuento")
  lost_reason        text,                                -- por qué se perdió (si stage='lost')
  source             text not null default 'manual',      -- de dónde salió: manual / bot / whatsapp
  created_by         uuid references auth.users(id) on delete set null,  -- null si la creó el bot
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.monetization_opportunities is
  'Oportunidades de venta de productos/plataformas a creadoras (interested->offered->negotiating->won/lost). El bot las registra/persigue; se ven/manejan en la pantalla de Maven. Clave humana: creator_handle. Sin teléfono (no PII).';

-- Índices: el seguimiento barre por (tenant, oportunidades abiertas, próximo toque);
-- la pantalla filtra por persona; y buscamos por handle para encontrar/actualizar.
create index if not exists monetization_opps_followup_idx
  on public.monetization_opportunities (tenant_id, stage, next_followup_at);
create index if not exists monetization_opps_assigned_idx
  on public.monetization_opportunities (assigned_to);
create index if not exists monetization_opps_handle_idx
  on public.monetization_opportunities (tenant_id, lower(creator_handle));

create trigger monetization_opps_set_updated_at
  before update on public.monetization_opportunities
  for each row execute function public.update_updated_at_column();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Ver: supervisor_or_above (admin + manager + supervisores = oversight) ve TODO;
--      el resto ve las que tiene asignadas o creó.
-- Escribir: supervisor_or_above, o el dueño (assigned_to) sobre las suyas.
-- El bot escribe vía service_role (bypassa RLS).
alter table public.monetization_opportunities enable row level security;

create policy monetization_opps_select on public.monetization_opportunities
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      or assigned_to = auth.uid()
      or created_by = auth.uid()
    )
  );

create policy monetization_opps_write on public.monetization_opportunities
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      or assigned_to = auth.uid()
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and (
      public.is_in_role_group(auth.uid(), 'supervisor_or_above')
      or assigned_to = auth.uid()
    )
  );

grant select, insert, update, delete on public.monetization_opportunities to authenticated;
