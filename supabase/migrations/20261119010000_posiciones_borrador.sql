-- POSICIONES Y PERMISOS AL ESTILO BLU — EL BORRADOR (Alvaro, 18/11/2026).
--
-- Alvaro quiere la estructura de Blu/Infloww (posición → Menús | Funciones |
-- Datos, check por check) dentro de Maven, visible SOLO para el dueño, para
-- probarla sin que nada se mueva: «ponlo al aire, que solo lo vea yo, y cuando
-- diga que sí, pasa a producción».
--
-- Estas tablas NO las lee ningún permiso de la app: ni RLS, ni usePermissions,
-- ni las edge functions. Marcar o desmarcar aquí no le cambia el acceso a
-- nadie. Cuando Alvaro dé el «dale», una migración aparte hace que el
-- borrador mande (y apaga las puertas traseras una a una).
--
-- Todo: solo el dueño (es_dueno), leer y escribir.

create table if not exists public.posiciones_borrador (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 80),
  descripcion text check (descripcion is null or length(descripcion) <= 300),
  activa boolean not null default true,
  acceso_total boolean not null default false,
  todas_creadoras boolean not null default false,
  -- { "Modulo|Sub" | "N:clave": true } — solo se guardan los checks prendidos.
  checks jsonb not null default '{}'::jsonb,
  -- { "<fila>": "all" | "subordinates" | "self" }
  alcances jsonb not null default '{}'::jsonb,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posiciones_borrador_personas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  posicion_id uuid not null references public.posiciones_borrador(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, posicion_id)
);
create index if not exists posiciones_borrador_personas_posicion_idx
  on public.posiciones_borrador_personas (posicion_id);

-- Lo único que va por persona y no por posición.
create table if not exists public.personas_borrador_marcas (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  protegido boolean not null default false,
  sin_camara boolean not null default false,
  deshabilitada boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.posiciones_borrador enable row level security;
alter table public.posiciones_borrador_personas enable row level security;
alter table public.personas_borrador_marcas enable row level security;

create policy posiciones_borrador_dueno on public.posiciones_borrador
  for all to authenticated
  using ((select public.es_dueno((select auth.uid()))))
  with check ((select public.es_dueno((select auth.uid()))));

create policy posiciones_borrador_personas_dueno on public.posiciones_borrador_personas
  for all to authenticated
  using ((select public.es_dueno((select auth.uid()))))
  with check ((select public.es_dueno((select auth.uid()))));

create policy personas_borrador_marcas_dueno on public.personas_borrador_marcas
  for all to authenticated
  using ((select public.es_dueno((select auth.uid()))))
  with check ((select public.es_dueno((select auth.uid()))));
