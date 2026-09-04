-- PEDIDOS DE DEMO DESDE LA PORTADA.
--
-- El correo puede fallar (Resend caído, casilla llena) y un pedido de demo
-- perdido es plata perdida: se guarda la fila PRIMERO y el correo se manda
-- después, marcando en la fila si salió. Así nada depende de que el mail
-- llegue.
--
-- Nadie escribe acá desde el navegador: la única puerta es la edge function
-- `demo-request`, que entra con service_role. Por eso no hay policy de
-- INSERT — con RLS activo y sin policy, anon y authenticated no pueden nada.
create table if not exists public.demo_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  nombre        text not null,
  empresa       text,
  email         text not null,
  telefono      text,
  tamano_equipo text,
  interes       text[] not null default '{}',
  mensaje       text,
  -- De qué pestaña del hero salió: dice si se ve como empresa o como agencia.
  publico       text,
  origen        text,
  -- Hash del IP, no el IP: alcanza para frenar abuso (solo se compara por
  -- igualdad) y no guardamos un dato personal de alguien que todavía no es
  -- cliente.
  ip_hash       text,
  correo_enviado boolean not null default false,
  atendido_at   timestamptz,
  atendido_por  uuid references auth.users(id) on delete set null
);

create index if not exists demo_requests_created_idx on public.demo_requests (created_at desc);
create index if not exists demo_requests_ip_idx on public.demo_requests (ip_hash, created_at desc);
create index if not exists demo_requests_email_idx on public.demo_requests (lower(email), created_at desc);

alter table public.demo_requests enable row level security;

-- Solo los admin los leen y los marcan como atendidos. Un pedido de demo
-- trae el correo y el teléfono de alguien: no es para todo el equipo.
drop policy if exists demo_requests_admin_select on public.demo_requests;
create policy demo_requests_admin_select on public.demo_requests
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists demo_requests_admin_update on public.demo_requests;
create policy demo_requests_admin_update on public.demo_requests
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

comment on table public.demo_requests is
  'Pedidos de demo del formulario de la portada. Escribe solo la edge function demo-request (service_role); leen solo admins.';
