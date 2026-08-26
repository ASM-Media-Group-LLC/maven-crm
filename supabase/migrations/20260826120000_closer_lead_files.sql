-- Screenshots adjuntos a las notas de un lead del pipeline de Closers.
--
-- Pedido de Álvaro (26/08/2026): en Asignaciones, donde ponen las notas, poder
-- adjuntar capturas — y que el bot de WhatsApp pueda revisarlas.
--
-- Decisión de visibilidad (Jhon, 26/08): CADA UNO VE LO SUYO.
--   ⚠️ NO se puede usar is_in_role_group('supervisor_or_above') como hacen las
--   políticas de closer_creators: Miguel y María son AMBOS Closer Supervisor, así
--   que ese grupo los deja verse entre ellos y la restricción no serviría de nada.
--   Acá la llave es la PROPIEDAD DEL LEAD (assigned_to / created_by) + admin.
--
--   ⚠️ Tampoco se reusa el bucket 'creator-files': tiene la política
--   "Authenticated users can read creator-files", que deja a CUALQUIER usuario
--   autenticado leer CUALQUIER objeto del bucket. Guardar ahí las capturas
--   rompería la restricción aunque la fila estuviera protegida. Por eso un bucket
--   propio con políticas por dueño del lead.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Bucket privado, con límite de tamaño y de tipo (creator-files no tiene ninguno)
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'closer-evidence', 'closer-evidence', false,
  5242880,                                              -- 5 MB, igual que promolog-evidence
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helper de acceso — una sola definición para la tabla y para el storage
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER a propósito: necesita mirar closer_creators sin quedar sujeta
-- al RLS de esa tabla (evita recursión y hace que la regla sea la misma para todos).
create or replace function public.can_access_closer_lead(p_creator_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (
      select 1
      from public.closer_creators cc
      where cc.id = p_creator_id
        and (cc.assigned_to = auth.uid() or cc.created_by = auth.uid())
    )
    or public.has_role(auth.uid(), 'admin'::app_role),
    false
  );
$$;

comment on function public.can_access_closer_lead(uuid) is
  'True si el usuario actual es dueño del lead (assigned_to o created_by) o es admin. '
  'Base de la visibilidad "cada uno ve lo suyo" de closer_lead_files. '
  'NO usa supervisor_or_above: los closers de Ventas están todos en ese grupo.';

revoke all on function public.can_access_closer_lead(uuid) from public, anon;
grant execute on function public.can_access_closer_lead(uuid) to authenticated, service_role;

-- Sobrecarga para el storage: el path es texto libre. Si la primera carpeta no es
-- un uuid válido, el cast directo tiraría 22P02 y rompería el listado del bucket
-- entero en vez de simplemente denegar. Acá se valida antes y se devuelve false.
create or replace function public.can_access_closer_lead(p_creator_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_creator_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.can_access_closer_lead(p_creator_id::uuid)
    else false
  end;
$$;

revoke all on function public.can_access_closer_lead(text) from public, anon;
grant execute on function public.can_access_closer_lead(text) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Tabla de adjuntos
-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla hija y no un jsonb en closer_creators: el batch de visión necesita poder
-- filtrar "las que todavía no analicé" con un índice, y cada archivo lleva su
-- propio autor y timestamp.
create table if not exists public.closer_lead_files (
  id            uuid primary key default gen_random_uuid(),
  creator_id    uuid not null references public.closer_creators(id) on delete cascade,
  storage_path  text not null unique,          -- '{creator_id}/{uuid}.{ext}' dentro de closer-evidence
  file_name     text not null,
  mime_type     text not null,
  size_bytes    integer,
  uploaded_by   uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),

  -- Resultado del análisis de visión (lo escribe la edge closers-analyze-screenshot).
  -- El bot NUNCA ve la imagen: lee este texto. Mismo contrato que
  -- whatsapp_messages.transcribed_text / wa_conversation_messages.body.
  vision_text      text,
  vision_analysis  jsonb,
  analyzed_at      timestamptz,
  analysis_error   text,
  analysis_attempts smallint not null default 0,

  constraint closer_lead_files_mime_ck
    check (mime_type in ('image/png','image/jpeg','image/webp')),
  constraint closer_lead_files_size_ck
    check (size_bytes is null or size_bytes <= 5242880)
);

comment on table public.closer_lead_files is
  'Capturas adjuntas a las notas de un lead de Closers. Visibilidad por dueño del lead. '
  'vision_text lo llena la edge closers-analyze-screenshot para que el bot pueda leerlas.';

create index if not exists idx_closer_lead_files_creator
  on public.closer_lead_files (creator_id, created_at desc);

-- Índice parcial para la cola del batch: solo lo pendiente, que es lo que escanea el cron.
create index if not exists idx_closer_lead_files_pendientes
  on public.closer_lead_files (created_at)
  where analyzed_at is null and analysis_attempts < 3;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS de la tabla
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.closer_lead_files enable row level security;

drop policy if exists closer_lead_files_select on public.closer_lead_files;
create policy closer_lead_files_select on public.closer_lead_files
  for select to authenticated
  using (public.can_access_closer_lead(creator_id));

-- Subir: solo a un lead propio, y firmando con tu propio uid.
drop policy if exists closer_lead_files_insert on public.closer_lead_files;
create policy closer_lead_files_insert on public.closer_lead_files
  for insert to authenticated
  with check (
    public.can_access_closer_lead(creator_id)
    and uploaded_by = auth.uid()
  );

-- Borrar: quien la subió, o un admin.
drop policy if exists closer_lead_files_delete on public.closer_lead_files;
create policy closer_lead_files_delete on public.closer_lead_files
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.has_role(auth.uid(), 'admin'::app_role));

-- Sin política de UPDATE a propósito: las columnas de visión las escribe la edge
-- con service_role (que bypassa RLS). Nadie edita un adjunto desde la app.

grant select, insert, delete on public.closer_lead_files to authenticated;
grant all on public.closer_lead_files to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RLS del storage — misma regla, sacando el creator_id de la primera carpeta
-- ─────────────────────────────────────────────────────────────────────────────
-- Sin esto, proteger la fila no sirve: el objeto seguiría siendo alcanzable.
drop policy if exists "closer-evidence propias: leer"    on storage.objects;
drop policy if exists "closer-evidence propias: subir"   on storage.objects;
drop policy if exists "closer-evidence propias: borrar"  on storage.objects;

create policy "closer-evidence propias: leer" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'closer-evidence'
    and public.can_access_closer_lead((storage.foldername(name))[1])
  );

create policy "closer-evidence propias: subir" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'closer-evidence'
    and public.can_access_closer_lead((storage.foldername(name))[1])
  );

create policy "closer-evidence propias: borrar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'closer-evidence'
    and (
      owner = auth.uid()
      or public.has_role(auth.uid(), 'admin'::app_role)
    )
  );
