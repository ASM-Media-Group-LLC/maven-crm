-- Clari privada por WhatsApp (bot 1:1) — modela cada chat privado como un "pseudo-grupo"
-- para reusar todo el motor de whatsapp-agent. Ver whatsapp-ingest (rama isDirect) que
-- rutea DMs de remitentes whitelisted al agente.

-- Permitir department 'private' en wa_bots.
alter table public.wa_bots drop constraint wa_bots_department_check;
alter table public.wa_bots add constraint wa_bots_department_check
  check (department = any (array['sales','closer','manager','recruitment','chatter','other','private']));

-- Marca de chat privado 1:1 en whatsapp_groups (el pseudo-grupo del DM).
alter table public.whatsapp_groups add column if not exists is_direct boolean not null default false;

-- Whitelist: quién puede hablarle al bot privado (por número, E.164 sin '+' ni símbolos).
create table if not exists public.wa_dm_allowlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  phone_digits text not null,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, phone_digits)
);
alter table public.wa_dm_allowlist enable row level security;
-- Sin policies → solo service_role (el ingest, que corre con service role). Backstop.

insert into public.wa_dm_allowlist (tenant_id, phone_digits, label) values
  ('30869615-f579-4981-8a1f-dbebc61eae2d','573215570078','Jhon Lopez'),
  ('30869615-f579-4981-8a1f-dbebc61eae2d','17866946354','Alvaro Mejia')
on conflict (tenant_id, phone_digits) do nothing;

-- Bot "Clari (privado)": persona cross-CRM + TODAS las tools (allowlist null = inline+catálogo)
-- menos las de equipo/reportes/reglas que no aplican a un 1:1 (denylist).
insert into public.wa_bots (tenant_id, name, department, model, manual_prompt, tool_allowlist, tool_denylist, active)
values (
  '30869615-f579-4981-8a1f-dbebc61eae2d','Clari (privado)','private','claude-sonnet-4-6',
  'BOT PRIVADO — CLARI (asistente 1:1 de direccion). Ver manual_prompt en la fila (se edita en DB).',
  null,
  '["register_daily_report","register_day_off","get_team_ranking","get_team_schedule","get_member_stats","get_member_maven_activity","get_llg_account_status","validate_report_vs_maven","search_messages","list_commitments","resolve_commitment","snooze_commitment","create_reminder","add_persistent_rule","list_rules","deactivate_rule"]'::jsonb,
  true
)
on conflict do nothing;

notify pgrst, 'reload schema';
