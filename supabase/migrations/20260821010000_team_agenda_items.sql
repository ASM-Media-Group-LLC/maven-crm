-- Itinerario/agenda del equipo (pedido de Álvaro por audio 20-21/08): que el bot
-- LLEVE el itinerario de verdad — estructura real, no reconstrucción del chat — para
-- hacer tracking a los casos, pushear y recordar, separado por persona.
--
-- Fuente de verdad del "qué toca hoy" por persona + su estado. El PUSH a la hora se
-- delega al subsistema de reminders existente (whatsapp_reminders, drenado por cron):
-- set_agenda_item con hora crea un reminder y guarda su id acá; al resolver/cancelar
-- se cancela el reminder para que no dispare de más.
--
-- RLS: ON sin políticas permisivas → solo service_role (el bot) accede; queda cerrada
-- para anon/authenticated hasta que una UI la necesite (ahí se agregan políticas).

create table if not exists public.team_agenda_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  group_id         uuid not null,               -- grupo de WhatsApp (equipo)
  owner_name       text not null,               -- a quién le toca (Miguel/Juan/María…)
  owner_user_id    uuid,                         -- link opcional a profiles
  title            text not null,               -- qué (llamada con Juan Felipe…)
  item_date        date not null,               -- el día (Bogotá)
  due_at           timestamptz,                  -- hora puntual (opcional)
  status           text not null default 'pending'
                     check (status in ('pending','done','reagendado','no_show','cancelado')),
  result           text,                         -- qué pasó
  linked_handle    text,                         -- @handle de lead/agencia si aplica
  reminder_id      uuid,                         -- fila de whatsapp_reminders que lo pushea
  reschedule_count int  not null default 0,      -- para "sin reagendamientos sorpresa"
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.team_agenda_items is
  'Itinerario del equipo por persona/día. El bot lo llena (set_agenda_item), lo lee agrupado por persona (get_agenda) y lo cierra (resolve_agenda_item). El push a la hora usa whatsapp_reminders (reminder_id).';

-- Lectura del día por grupo (get_agenda) y por persona.
create index if not exists idx_agenda_group_date
  on public.team_agenda_items (group_id, item_date);
create index if not exists idx_agenda_group_date_owner
  on public.team_agenda_items (group_id, item_date, owner_name);

-- Dedup blando: una misma cosa, mismo dueño, mismo día → un solo item (el tool
-- hace upsert buscando por esta forma; el índice acelera esa búsqueda).
create index if not exists idx_agenda_dedup
  on public.team_agenda_items (tenant_id, group_id, item_date, owner_name, lower(title));

alter table public.team_agenda_items enable row level security;
-- Sin políticas: RLS ON = cerrada para anon/authenticated; el bot entra por service_role.
