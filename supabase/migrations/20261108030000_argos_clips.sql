-- Argos — video al distraerse (Alvaro, 08/11/2026).
-- Cuando la escalera de captura confirma distracción (1min → 30s → 20s → graba),
-- el cliente graba un VIDEO de la PANTALLA y lo sube. Esta tabla es el índice de
-- esos clips; el video vive en el bucket privado `argos-clips` (luego se mueve al
-- NAS, igual que los pantallazos). Se ve en el expediente de la persona.
--
-- SILENCIOSO: la persona puede INSERTAR su propio clip (su cliente lo sube) pero
-- NO puede leerlo (no hay policy sel_propio). Solo el dueño lo ve (es_dueno).

create table if not exists public.argos_clips (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  room_nombre  text,
  -- por qué arrancó: distraida_pantalla | distraida_camara | distraida_ambas
  motivo       text,
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  duracion_seg integer,
  -- dónde vive el video: path en el bucket `argos-clips` (y luego el NAS).
  path         text not null,
  en_nas       boolean not null default false,
  nas_path     text,
  created_at   timestamptz not null default now()
);

-- Para el expediente: los clips de una persona en un día, lo más nuevo primero.
create index if not exists argos_clips_user_fecha_idx
  on public.argos_clips (user_id, started_at desc);

alter table public.argos_clips enable row level security;

-- La persona sube su propio clip (su cliente lo inserta). No lo lee.
drop policy if exists argos_clips_ins_propio on public.argos_clips;
create policy argos_clips_ins_propio on public.argos_clips
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Solo el dueño ve los clips (silencioso para la persona).
drop policy if exists argos_clips_sel_dueno on public.argos_clips;
create policy argos_clips_sel_dueno on public.argos_clips
  for select to authenticated
  using (es_dueno((select auth.uid())));

-- El dueño puede actualizar (marcar en_nas / nas_path) y borrar.
drop policy if exists argos_clips_upd_dueno on public.argos_clips;
create policy argos_clips_upd_dueno on public.argos_clips
  for update to authenticated
  using (es_dueno((select auth.uid())))
  with check (es_dueno((select auth.uid())));

drop policy if exists argos_clips_del_dueno on public.argos_clips;
create policy argos_clips_del_dueno on public.argos_clips
  for delete to authenticated
  using (es_dueno((select auth.uid())));

-- Bucket privado para los videos (el mover al NAS usa service role, salta RLS).
insert into storage.buckets (id, name, public)
values ('argos-clips', 'argos-clips', false)
on conflict (id) do nothing;

-- Storage: la persona sube a SU carpeta (primer segmento del path = su uid).
drop policy if exists argos_clips_obj_ins on storage.objects;
create policy argos_clips_obj_ins on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'argos-clips'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Storage: solo el dueño descarga/lista los videos.
drop policy if exists argos_clips_obj_sel on storage.objects;
create policy argos_clips_obj_sel on storage.objects
  for select to authenticated
  using (bucket_id = 'argos-clips' and es_dueno((select auth.uid())));

-- Borrado automático a los 30 días (retención). El cron lo llama con service role.
create or replace function public.argos_clips_purga()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare borrados integer;
begin
  -- 1) borra los videos del bucket (los que no se movieron al NAS).
  delete from storage.objects
  where bucket_id = 'argos-clips'
    and created_at < now() - interval '30 days';
  -- 2) borra el índice.
  with viejos as (
    delete from public.argos_clips
    where started_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into borrados from viejos;
  return borrados;
end;
$$;
