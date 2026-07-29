-- Memoria por-persona: hechos que el equipo le cuenta al bot sobre sí mismos o
-- sobre otros (ej. "María no maneja IG", "Miguel prefiere que le pasen los cierres
-- por privado"). Se inyectan en el prompt del whatsapp-agent en cada corrida, así
-- el bot deja de olvidar cosas que ya le dijeron y no depende solo de la ventana
-- de contexto de 30 mensajes.
create table if not exists public.whatsapp_person_facts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  subject_user_id uuid not null references public.profiles(id) on delete cascade, -- de quién es el hecho
  fact            text not null,
  created_by      uuid references public.profiles(id),                            -- quién lo enseñó
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists whatsapp_person_facts_tenant_active_idx on public.whatsapp_person_facts(tenant_id, active);
create index if not exists whatsapp_person_facts_subject_idx on public.whatsapp_person_facts(subject_user_id);
alter table public.whatsapp_person_facts enable row level security;
-- Sin policies: solo el edge fn (service_role, bypassa RLS) lee/escribe. El
-- scoping por rol (quién puede grabar hechos de quién) lo hace el tool en código.
