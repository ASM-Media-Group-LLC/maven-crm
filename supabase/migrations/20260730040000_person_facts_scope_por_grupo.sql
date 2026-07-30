-- La memoria por-persona (whatsapp_person_facts) se cargaba por TENANT: un hecho
-- contado en Managers aparecía en el prompt del bot de Ventas, de AI WARMING y del DM
-- privado de Álvaro. Se agrega group_id para que cada hecho quede en el grupo donde se
-- contó (loadPersonFacts filtra por acá; remember_fact/forget_fact lo escriben y usan).
alter table public.whatsapp_person_facts
  add column if not exists group_id uuid references public.whatsapp_groups(id) on delete cascade;

create index if not exists whatsapp_person_facts_group_active_idx
  on public.whatsapp_person_facts(group_id, active);

-- Backfill: las únicas filas existentes se cargaron desde Marketing/Ventas.
update public.whatsapp_person_facts
set group_id = 'd12ec56f-b324-4369-b72d-7540fb930ef6'
where group_id is null;
