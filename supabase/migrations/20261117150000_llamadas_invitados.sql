-- LLAMADAS DE LOS INVITADOS DE AFUERA (Alvaro, 17/11/2026: «con gente de afuera
-- no nos ha estado funcionando bien, se cae»).
--
-- 1) Medirlos. llamada_cortes y llamada_salud solo aceptan filas de alguien CON
--    sesión (user_id = auth.uid()); el invitado de Meet no tiene, y lo que
--    mandaba se rechazaba en silencio: sus caídas no existían en ningún lado.
--    Ahora llegan por la edge `meet-guest` (acción `telemetria`, validando su
--    secreto y que esté admitido) a estas dos tablas, con las mismas columnas
--    que las del equipo más el pedido y la reunión.
--    Escribe solo el service_role (la edge); leen admin y dueño. La fase de un
--    corte es la misma que la del equipo (ver frontend/src/lib/saludDeLlamada.ts
--    y lib/equipoDormido.ts).
--
-- 2) Volver solo tras una caída, 15 minutos (meet-guest, REENTRADA_DEL_INVITADO_MS).
--    `salio_a_proposito` distingue colgar (la admisión se termina, la regla de
--    Jhon del 09/09) de una caída (cerró o recargó la página en medio de la
--    llamada). Lo que ya existe queda como salida a propósito: la regla de antes.
--    La edge funciona con o sin esta columna (lee con `*`), así que el orden en
--    que lleguen la edge y la migración no rompe a los invitados.

alter table public.meet_guest_requests
  add column if not exists salio_a_proposito boolean not null default true;

create table if not exists public.llamada_cortes_invitados (
  id bigint generated always as identity primary key,
  guest_request_id uuid not null references public.meet_guest_requests(id) on delete cascade,
  meet_room_id uuid not null references public.meet_rooms(id) on delete cascade,
  sala text,
  fase text not null,
  motivo text,
  contexto jsonb,
  creado timestamptz not null default now()
);
alter table public.llamada_cortes_invitados enable row level security;
create policy "llamada_cortes_invitados_leen_admin_y_dueno" on public.llamada_cortes_invitados
  for select to authenticated
  using (public.es_admin_o_dueno((select auth.uid())));
create index if not exists llamada_cortes_invitados_pedido_creado_idx
  on public.llamada_cortes_invitados (guest_request_id, creado desc);
create index if not exists llamada_cortes_invitados_creado_idx
  on public.llamada_cortes_invitados (creado desc);

create table if not exists public.llamada_salud_invitados (
  id bigint generated always as identity primary key,
  guest_request_id uuid not null references public.meet_guest_requests(id) on delete cascade,
  meet_room_id uuid not null references public.meet_rooms(id) on delete cascade,
  sala text,
  datos jsonb not null,
  creado timestamptz not null default now()
);
alter table public.llamada_salud_invitados enable row level security;
create policy "llamada_salud_invitados_leen_admin_y_dueno" on public.llamada_salud_invitados
  for select to authenticated
  using (public.es_admin_o_dueno((select auth.uid())));
create index if not exists llamada_salud_invitados_pedido_creado_idx
  on public.llamada_salud_invitados (guest_request_id, creado desc);
create index if not exists llamada_salud_invitados_creado_idx
  on public.llamada_salud_invitados (creado desc);
