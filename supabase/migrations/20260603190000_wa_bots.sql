-- =============================================================================
-- wa_bots — Bots como DATOS (Fase 3 de la plataforma WhatsApp multi-bot)
-- -----------------------------------------------------------------------------
-- Hasta hoy el bot de WhatsApp es UNO solo, hardcodeado en la edge function
-- whatsapp-agent (SYSTEM_PROMPT monolítico). Esta tabla lo convierte en datos
-- para poder tener VARIOS bots (uno por departamento), configurables.
--
-- Modelo de un bot = 3 piezas:
--   • MOTOR    -> vive en CÓDIGO (whatsapp-agent), reutilizable por todos. NO acá.
--   • MANUAL   -> manual_prompt: el prompt específico del depto (vocabulario,
--                 objetivos, rutinas). Se suma al MOTOR en tiempo de ejecución.
--   • LLAVERO  -> tool_allowlist: qué herramientas (acceso a data) puede usar el
--                 bot. Garantía estructural: si una tool no está, el bot no la ve.
--   + model    -> override de modelo (null = usar el router por defecto del código).
--
-- Asignación: cada whatsapp_groups.wa_bot_id apunta a un wa_bot (nullable).
--   • wa_bot_id NULL -> comportamiento ACTUAL (SYSTEM_PROMPT completo + bot_persona).
--                       RETROCOMPAT: nada cambia hasta asignar un bot a un grupo.
--   • wa_bot_id set  -> el agent usa MOTOR + manual_prompt del bot, filtra tools
--                       por tool_allowlist/denylist, y usa model si está.
-- Un grupo tiene UNA línea (número) nuestra como miembro, así que "varios bots
-- por número" = varios grupos (cada uno con su wa_bot) sobre la misma línea.
--
-- El agent lee wa_bots vía service_role (bypassa RLS). La RLS de acá es solo
-- para la UI humana (config de bots = admin/supervisores).
-- =============================================================================

create table if not exists public.wa_bots (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.current_tenant_id(),
  name            text not null,                        -- "Ventas / Marketing", "Managers", ...
  department      text not null default 'other'
                    check (department in ('sales','closer','manager','recruitment','chatter','other')),
  description     text,                                 -- nota libre para la UI
  manual_prompt   text,                                 -- MANUAL: prompt del depto (se suma al MOTOR en código)
  model           text,                                 -- override de modelo; null = router por defecto (pickModel)
  tool_allowlist  jsonb,                                -- LLAVERO: array de nombres de tools permitidas; null = todas
  tool_denylist   jsonb,                                -- opcional: tools vedadas (se aplica sobre el allowlist)
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, name)
);
comment on table public.wa_bots is
  'Bots de WhatsApp como datos (Fase 3). MOTOR vive en código; acá el MANUAL (manual_prompt), el LLAVERO (tool_allowlist/denylist) y el modelo. Cada whatsapp_groups.wa_bot_id apunta a un bot (null = comportamiento legacy). El agent lo lee vía service_role.';

create index if not exists wa_bots_tenant_idx on public.wa_bots (tenant_id, active);

create trigger wa_bots_set_updated_at
  before update on public.wa_bots
  for each row execute function public.update_updated_at_column();

-- Asignación bot<->grupo: un grupo usa (a lo sumo) un bot. Nullable -> retrocompat.
alter table public.whatsapp_groups
  add column if not exists wa_bot_id uuid references public.wa_bots(id) on delete set null;

create index if not exists whatsapp_groups_wa_bot_idx on public.whatsapp_groups (wa_bot_id);

comment on column public.whatsapp_groups.wa_bot_id is
  'Bot (wa_bots) que atiende este grupo. NULL = comportamiento legacy (SYSTEM_PROMPT completo + bot_persona).';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Config de bots = tarea de admin/supervisores. El agent lee/escribe vía
-- service_role (bypassa RLS), así que esta policy no lo afecta.
alter table public.wa_bots enable row level security;

create policy wa_bots_select on public.wa_bots
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_in_role_group(auth.uid(), 'supervisor_or_above')
  );

create policy wa_bots_write on public.wa_bots
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_in_role_group(auth.uid(), 'supervisor_or_above')
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_in_role_group(auth.uid(), 'supervisor_or_above')
  );

grant select, insert, update, delete on public.wa_bots to authenticated;
