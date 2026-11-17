-- ═══════════════════════════════════════════════════════════════════════════
-- MEET CON GENTE DE AFUERA: link directo de invitado + Meet agendado
--
-- Alvaro (17/11/2026): «Meet igual que Google Meet, con gente de afuera». El
-- invitado sin cuenta abre un link, escribe su nombre y entra, sin clave y sin
-- sala de espera. Lo mismo desde una llamada del Messenger: le mandas un link
-- por WhatsApp o correo a alguien de afuera y entra a la llamada.
--
-- Quién reparte esos links: supervisores y arriba (is_in_role_group
-- 'supervisor_or_above'). Lo controla la edge meet-room, que es la única que
-- escribe esta tabla (con service_role).
--
-- POR QUÉ UNA TABLA Y NO EL CÓDIGO DE 6 LETRAS: el código se adivina probando.
-- El link lleva un secreto aparte (firma HMAC del id con un secreto del
-- servidor, ver supabase/functions/_shared/meet-link.ts). La base NO guarda el
-- link en claro: con esta tabla en la mano no se arma ningún link.
--
-- Qué abre cada link lo decide esta fila, nunca el navegador: la sala, hasta
-- cuándo vale, y si alguien lo anuló. Terminar la reunión también lo apaga.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.meet_invite_links (
  id uuid primary key default gen_random_uuid(),
  -- La sala de LiveKit que abre: meet_… (Meet) o call-<conversación> (Messenger).
  livekit_room_name text not null
    check (livekit_room_name ~ '^(meet_[a-z0-9]+|call-[0-9a-f-]{36})$'),
  -- Solo para Meet: al terminar la reunión el link deja de servir.
  meet_room_id uuid references public.meet_rooms(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  -- Cuántas veces entró alguien con este link (telemetría, no un tope).
  uses integer not null default 0
);

create index if not exists meet_invite_links_sala_idx
  on public.meet_invite_links (livekit_room_name, created_by, expires_at desc)
  where revoked_at is null;

alter table public.meet_invite_links enable row level security;

-- Quien lo creó lo ve (para saber hasta cuándo vale). Escribir: solo las edges.
drop policy if exists "Veo mis links de invitado" on public.meet_invite_links;
create policy "Veo mis links de invitado"
  on public.meet_invite_links for select to authenticated
  using (created_by = (select auth.uid()) and tenant_id = (select public.current_tenant_id()));

comment on table public.meet_invite_links is
  'Links directos de invitado (sin cuenta, sin sala de espera) a un Meet o a una llamada del Messenger. El link en claro no se guarda: es id + firma HMAC (edge meet-room / meet-guest).';

-- Quien entra por link directo queda anotado como admitido por quien repartió
-- el link: así el historial de la reunión dice quién dejó entrar a quién, y el
-- botón Salir del invitado (acción leave) funciona igual que con la sala de espera.
alter table public.meet_guest_requests
  add column if not exists invite_link_id uuid references public.meet_invite_links(id) on delete set null;

comment on column public.meet_guest_requests.invite_link_id is
  'Si entró por link directo (sin sala de espera), cuál. decided_by es quien repartió ese link.';

-- ── Meet agendado ─────────────────────────────────────────────────────────
-- «Agendar un Meet para una hora con invitación por correo con el link».
alter table public.meet_rooms
  add column if not exists scheduled_for timestamptz;

comment on column public.meet_rooms.scheduled_for is
  'Hora para la que se agendó la reunión (null = reunión de ahora). La invitación por correo la manda la edge meet-room (acción schedule).';
