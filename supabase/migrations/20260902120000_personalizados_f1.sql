-- PERSONALIZADOS — Fase 1 (schema + permisos).
--
-- Qué es: los pedidos de contenido personalizado que los fans compran por chat
-- ("un video de 8 min donde…"). Hoy viven en un Google Sheet ("PERSONALIZADOS
-- PLUS"): una fila por pedido, una pestaña por mes, estado a mano, notas a
-- colores y fotos de referencia pegadas en celdas. Pasa a ser un módulo de Maven
-- (sección Operaciones) con tablero por estado, tabla filtrable, formulario,
-- adjuntos como archivos e importador del sheet.
--
-- DECISIÓN DE DISEÑO CLAVE: cada pedido es un TICKET CON CICLO DE VIDA, no una
-- fila. El sheet mezclaba en "Estado" tres cosas: la venta (¿pagó?), la
-- producción (¿la creadora lo hizo?) y la entrega (¿se lo mandaron al fan?).
-- Separadas, el módulo puede avisar, medir tiempos y conectar con la Parrilla.
--
-- Estados:  solicitado → aprobado → en_produccion → listo → entregado
--           con salidas laterales: denegado, reembolsado.
-- Aprobar/denegar es de supervisor o superior (función "Aprobar"); el resto de
-- transiciones las hace el dueño del pedido o quien tenga "Gestionar".
-- Cada cambio de estado queda registrado (custom_request_events) por trigger:
-- la pestaña "PLUS Aprobadas" del sheet deja de existir — es un filtro.
--
-- Fases siguientes (acá para contexto):
--   F2: pedido aprobado → tarea en la Parrilla de la creadora con fecha límite;
--       avisos por Messenger/bot (manager al crear, creadora 24h antes del
--       límite, chatter cuando está listo); "Mi cola" para la creadora.
--   F3: cruce con BLU (gasto real del fan, saldo pendiente) y reportes.

-- ── El pedido ────────────────────────────────────────────────────────────────
create table if not exists public.custom_requests (
  id uuid primary key default gen_random_uuid(),
  -- Plus y Massive son DOS agencias con equipos distintos; un módulo, un filtro.
  agency text not null default 'plus' check (agency in ('plus','massive')),
  -- La creadora: FK cuando existe en Maven; el nombre siempre (los importados
  -- del sheet pueden no matchear, y el nombre es lo que la gente lee).
  creator_id uuid references public.creators(id) on delete set null,
  creator_name text not null,
  -- El chatter que vendió/gestiona el pedido. Igual: FK si existe, nombre siempre.
  chatter_id uuid references public.profiles(id) on delete set null,
  chatter_name text,
  -- El fan que lo compró (handle en la plataforma, p.ej. @u85422765).
  fan_handle text not null,
  requested_on date not null default current_date,
  -- Fecha límite de entrega: hoy no existe en el sheet y es la causa del
  -- "me lo prometieron hace tres semanas".
  due_on date,
  status text not null default 'solicitado'
    check (status in ('solicitado','aprobado','en_produccion','listo','entregado','denegado','reembolsado')),
  content_type text check (content_type in ('foto','video','audio','articulo')),
  -- Normal vs Buster del sheet = por qué canal se vendió.
  sale_channel text check (sale_channel in ('normal','buster')),
  description text not null,
  -- "Tiempo o cantidad": 8 min, 3 fotos, a discreción de la cc…
  duration_or_qty text,
  -- Dinero (USD). fan_total_spent = lo que el fan ha gastado en total con la
  -- creadora (contexto de venta); price = lo acordado; paid = lo cobrado hasta
  -- ahora (el "pagó 150 de adelanto y 150 al entregar" que hoy va en notas).
  fan_total_spent_usd numeric(12,2),
  price_usd numeric(12,2),
  paid_usd numeric(12,2),
  -- Avisos especiales (los amarillos del sheet): 'vendido_antes', 'cambio_contenido',
  -- 'fan_conflictivo', 'reembolso', 'entregado_al_user'…  texto libre acotado.
  flags text[] not null default '{}',
  notes text,
  denied_reason text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  delivered_at timestamptz,
  -- Origen: 'maven' o 'sheet' (importado). Con la fila/pestaña de origen para trazar.
  source text not null default 'maven',
  source_ref text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
create index if not exists custom_requests_status_idx on public.custom_requests (status);
create index if not exists custom_requests_creator_idx on public.custom_requests (creator_id);
create index if not exists custom_requests_chatter_idx on public.custom_requests (chatter_id);
create index if not exists custom_requests_requested_on_idx on public.custom_requests (requested_on desc);

-- ── Historial de cambios de estado (lo escribe un trigger, nunca el front) ────
create table if not exists public.custom_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists custom_request_events_request_idx on public.custom_request_events (request_id, created_at);

-- ── Adjuntos (fotos de referencia, la entrega) — archivos en el bucket privado ─
create table if not exists public.custom_request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.custom_requests(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  -- 'referencia' (lo que pide el fan) o 'entrega' (lo que hizo la creadora).
  kind text not null default 'referencia' check (kind in ('referencia','entrega')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists custom_request_attachments_request_idx on public.custom_request_attachments (request_id);

-- ── Trigger: updated_at + registro de estado + guarda de transiciones ─────────
create or replace function public.custom_requests_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    -- Aprobar/denegar es de supervisor+ (o de quien tenga la función explícita).
    -- Se guarda en la BD y no solo en el botón: un chatter con la consola abierta
    -- no puede aprobarse su propio pedido.
    if new.status in ('aprobado','denegado')
       and not public.can_use_module_function(auth.uid(), 'Personalizados', 'Aprobar', 'supervisor_or_above') then
      raise exception 'Solo un supervisor puede aprobar o denegar un pedido';
    end if;
    if new.status = 'aprobado' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    if new.status = 'entregado' then
      new.delivered_at := coalesce(new.delivered_at, now());
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists custom_requests_before_write on public.custom_requests;
create trigger custom_requests_before_write
  before insert or update on public.custom_requests
  for each row execute function public.custom_requests_before_write();

create or replace function public.custom_requests_log_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.custom_request_events (request_id, actor_id, from_status, to_status)
    values (new.id, auth.uid(), null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.custom_request_events (request_id, actor_id, from_status, to_status, note)
    values (new.id, auth.uid(), old.status, new.status,
            case when new.status = 'denegado' then new.denied_reason else null end);
  end if;
  return new;
end;
$$;

drop trigger if exists custom_requests_log_status on public.custom_requests;
create trigger custom_requests_log_status
  after insert or update on public.custom_requests
  for each row execute function public.custom_requests_log_status();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Lectura para autenticados (el acceso al MÓDULO lo gatea la UI vía
-- role_permissions, como Parrilla). Escritura por funciones:
--   Crear pedido → cualquier miembro (fallback 'member'); el dueño edita el suyo.
--   Gestionar    → supervisor+: editar/borrar cualquiera.
--   Aprobar      → supervisor+: lo exige el trigger en la transición.
alter table public.custom_requests enable row level security;
alter table public.custom_request_events enable row level security;
alter table public.custom_request_attachments enable row level security;

drop policy if exists cr_read on public.custom_requests;
create policy cr_read on public.custom_requests for select to authenticated using (true);
drop policy if exists cr_insert on public.custom_requests;
create policy cr_insert on public.custom_requests for insert to authenticated
  with check (public.can_use_module_function(auth.uid(), 'Personalizados', 'Crear pedido', 'member'));
drop policy if exists cr_update on public.custom_requests;
create policy cr_update on public.custom_requests for update to authenticated
  using (created_by = auth.uid() or chatter_id = auth.uid()
         or public.can_use_module_function(auth.uid(), 'Personalizados', 'Gestionar', 'supervisor_or_above'))
  with check (created_by = auth.uid() or chatter_id = auth.uid()
         or public.can_use_module_function(auth.uid(), 'Personalizados', 'Gestionar', 'supervisor_or_above'));
drop policy if exists cr_delete on public.custom_requests;
create policy cr_delete on public.custom_requests for delete to authenticated
  using (public.can_use_module_function(auth.uid(), 'Personalizados', 'Gestionar', 'supervisor_or_above'));

drop policy if exists cre_read on public.custom_request_events;
create policy cre_read on public.custom_request_events for select to authenticated using (true);
-- Los eventos los escribe el trigger (security definer): nadie inserta a mano.

drop policy if exists cra_read on public.custom_request_attachments;
create policy cra_read on public.custom_request_attachments for select to authenticated using (true);
drop policy if exists cra_insert on public.custom_request_attachments;
create policy cra_insert on public.custom_request_attachments for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists cra_delete on public.custom_request_attachments;
create policy cra_delete on public.custom_request_attachments for delete to authenticated
  using (created_by = auth.uid()
         or public.can_use_module_function(auth.uid(), 'Personalizados', 'Gestionar', 'supervisor_or_above'));

-- ── Bucket PRIVADO para adjuntos (se sirven con URL firmada, nunca pública:
--    son referencias de contenido adulto y entregas de las creadoras) ─────────
insert into storage.buckets (id, name, public)
values ('custom-requests', 'custom-requests', false)
on conflict (id) do nothing;

drop policy if exists "custom-requests read" on storage.objects;
create policy "custom-requests read" on storage.objects for select to authenticated
  using (bucket_id = 'custom-requests');
drop policy if exists "custom-requests insert" on storage.objects;
create policy "custom-requests insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'custom-requests');
drop policy if exists "custom-requests delete" on storage.objects;
create policy "custom-requests delete" on storage.objects for delete to authenticated
  using (bucket_id = 'custom-requests' and owner = auth.uid());

-- ── Permisos iniciales (el módulo nace LOCKED para cualquier rol sin fila) ────
-- Chatters y coordinadores: ven y crean pedidos. Chatter Supervisor, Coordinador
-- Supervisor y managers: además aprueban y gestionan. Admin no necesita filas.
-- Solo se insertan las que no existan: si un admin ya ajustó algo, se respeta.
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, v.module, v.submodule, true, 'all'
from public.roles_config rc
cross join (values
  ('Personalizados', null),
  ('Personalizados', 'Tablero'),
  ('Personalizados', 'Tabla'),
  ('Personalizados', 'Crear pedido')
) as v(module, submodule)
where rc.name in ('Chatter', 'Coordinador', 'Chatter Supervisor', 'Coordinador Supervisor', 'manager')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = rc.id and rp.module = v.module
      and coalesce(rp.submodule,'') = coalesce(v.submodule,'')
  );

insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, v.module, v.submodule, true, 'all'
from public.roles_config rc
cross join (values
  ('Personalizados', 'Aprobar'),
  ('Personalizados', 'Gestionar')
) as v(module, submodule)
where rc.name in ('Chatter Supervisor', 'Coordinador Supervisor', 'manager')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = rc.id and rp.module = v.module
      and coalesce(rp.submodule,'') = coalesce(v.submodule,'')
  );

notify pgrst, 'reload schema';
