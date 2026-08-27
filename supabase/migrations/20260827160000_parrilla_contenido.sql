-- PARRILLA DE CONTENIDO — Fase 1 (schema + permisos + seed de la v14 vigente).
--
-- Qué es: el plan semanal de promoción de las creadoras (el PDF "Parrilla de
-- promoción · 8 días" que las managers arman a mano hoy). Se vuelve un módulo de
-- Maven (sección Operaciones) con editor visual, tema configurable e impresión a PDF.
--
-- DECISIÓN DE DISEÑO CLAVE: la parrilla vive como DATOS TIPADOS, no como documento.
-- Cada día lleva formato/idea/copy/franja + una "acción extra" tipada con sus copies
-- y referencias. De cada parrilla se derivan TAREAS ESPERADAS máquina-legibles
-- (content_grid_tasks: red + tipo + cantidad + franja) → es la base para que
-- Promolog verifique CUMPLIMIENTO (¿hubo story en franja? ¿reel el viernes? ¿3
-- publicaciones TG el sábado? ¿audio el lunes?) cruzando con promolog_entries y la
-- bandeja de Telegram. `verificable=false` marca tareas INTERNAS (p.ej. "mandar
-- contenido a los chatters") que no son publicaciones públicas y no se auditan.
--
-- Fases siguientes (documentadas acá para contexto):
--   F2: cron lunes 10:00 Col genera la semana nueva con IA (usando historial de
--       EDICIONES MANUALES + feedback exigido de las managers como aprendizaje),
--       renderiza PDF (Gotenberg en Dokploy) y lo manda al grupo de Managers por
--       WhatsApp (el gateway ya soporta documentos).
--   F3: banco de referencias alimentado por Apify (reels en tendencia por nicho).
--   F4: compliance en Promolog sobre content_grid_tasks (+ ai_appeal como calidad
--       de ejecución).

-- ── La parrilla (una por semana) ──────────────────────────────────────────────
create table if not exists public.content_grids (
  id uuid primary key default gen_random_uuid(),
  week_start date not null unique,
  week_end date not null,
  title text not null default 'Parrilla de promoción',
  status text not null default 'borrador' check (status in ('borrador','lista','enviada')),
  -- Tema visual configurable (colores por tipo de tarea + base) — v14 como default.
  theme jsonb not null default '{"foto":"#b08d2f","video":"#d6336c","telegram":"#7048e8","urgencia":"#e8590c","base":"#faf6ef","tinta":"#1a1a1a"}'::jsonb,
  -- Snapshot de lo que GENERÓ la IA (F2): contra esto se diffean las ediciones
  -- manuales de las managers → alimenta el prompt de la semana siguiente.
  generated_snapshot jsonb,
  -- Feedback de la revisión manual (F2 lo EXIGE antes de enviar): qué estuvo bien,
  -- qué cambiarían. También alimenta la generación siguiente.
  feedback text,
  feedback_by uuid references public.profiles(id),
  feedback_at timestamptz,
  pdf_url text,
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- ── Los días (8 columnas del tablero) ─────────────────────────────────────────
create table if not exists public.content_grid_days (
  id uuid primary key default gen_random_uuid(),
  grid_id uuid not null references public.content_grids(id) on delete cascade,
  day_index int not null check (day_index between 1 and 10),
  date date not null,
  format_badge text not null default 'flyer_foto' check (format_badge in ('flyer_foto','video_corto')),
  idea text not null default '',
  copy_sugerido text not null default '',
  franja text not null default '11:00 - 13:00',
  extra_type text not null default 'custom'
    check (extra_type in ('dinamica_lanzamiento','reel','tg_3pub','tg_audio','dinamica_cierre','custom')),
  extra_title text not null default '',
  extra_desc text not null default '',
  -- Copies de la acción extra: [{momento?: 'mañana'|'tarde'|'noche', label, copy}]
  extra_items jsonb not null default '[]'::jsonb,
  -- Referencias de reels del día: [{url, nicho, formato}]
  refs jsonb not null default '[]'::jsonb,
  unique (grid_id, day_index)
);

-- ── Tareas esperadas (compliance futuro de Promolog) ─────────────────────────
create table if not exists public.content_grid_tasks (
  id uuid primary key default gen_random_uuid(),
  grid_id uuid not null references public.content_grids(id) on delete cascade,
  day_date date not null,
  network text not null check (network in ('instagram','x','telegram')),
  task_type text not null check (task_type in ('publicacion','reel','tg_publicacion','tg_audio','urgencia')),
  qty int not null default 1 check (qty between 1 and 10),
  franja text,
  -- false = tarea INTERNA (p.ej. preparar contenido para chatters): no es publicación
  -- pública y Promolog NO la audita.
  verificable boolean not null default true,
  detalle text
);
create index if not exists idx_cgt_grid on public.content_grid_tasks (grid_id);
create index if not exists idx_cgt_date on public.content_grid_tasks (day_date);

-- ── Banco de referencias (reels en tendencia, por nicho) ─────────────────────
create table if not exists public.content_grid_refs (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  nicho text,
  formato text,      -- GRWM, transición de outfit, compartible por DM, etc.
  notes text,
  active boolean not null default true,
  source text not null default 'manual' check (source in ('manual','apify')),
  added_by uuid,
  added_at timestamptz not null default now(),
  last_used_week date,
  times_used int not null default 0
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Lectura: cualquier usuario autenticado con el módulo (el gate fino lo hace la UI
-- vía role_permissions; acá gateamos ESCRITURA con can_use_module_function, el mismo
-- patrón que ticket_forms). fallback_group 'manager' = si el rol no tiene fila
-- explícita de la función, managers/admin pasan.
alter table public.content_grids enable row level security;
alter table public.content_grid_days enable row level security;
alter table public.content_grid_tasks enable row level security;
alter table public.content_grid_refs enable row level security;

drop policy if exists cg_read on public.content_grids;
create policy cg_read on public.content_grids for select to authenticated using (true);
drop policy if exists cg_write on public.content_grids;
create policy cg_write on public.content_grids for all to authenticated
  using (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'))
  with check (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'));

drop policy if exists cgd_read on public.content_grid_days;
create policy cgd_read on public.content_grid_days for select to authenticated using (true);
drop policy if exists cgd_write on public.content_grid_days;
create policy cgd_write on public.content_grid_days for all to authenticated
  using (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'))
  with check (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'));

drop policy if exists cgt_read on public.content_grid_tasks;
create policy cgt_read on public.content_grid_tasks for select to authenticated using (true);
drop policy if exists cgt_write on public.content_grid_tasks;
create policy cgt_write on public.content_grid_tasks for all to authenticated
  using (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'))
  with check (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'));

drop policy if exists cgr_read on public.content_grid_refs;
create policy cgr_read on public.content_grid_refs for select to authenticated using (true);
drop policy if exists cgr_write on public.content_grid_refs;
create policy cgr_write on public.content_grid_refs for all to authenticated
  using (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'))
  with check (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'));

-- ── Permisos default: manager + HHRR (admin es implícito) ────────────────────
-- Módulo "Parrilla" (sección Operaciones): subtabs Parrilla/Referencias + funciones.
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, v.module, v.submodule, true, 'all'
from public.roles_config rc
cross join (values
  ('Parrilla', null),
  ('Parrilla', 'Parrilla'),
  ('Parrilla', 'Referencias'),
  ('Parrilla', 'Editar'),
  ('Parrilla', 'Enviar al grupo')
) as v(module, submodule)
where rc.name in ('manager','HHRR')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = rc.id and rp.module = v.module
      and coalesce(rp.submodule,'') = coalesce(v.submodule,'')
  );

notify pgrst, 'reload schema';
