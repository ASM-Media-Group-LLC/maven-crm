-- CLIPS de video (con audio) de Argos: cuando un empleado se distrae / no mira a
-- cámara, el navegador graba un clip corto (≤3 min) y lo deja en el buzón de
-- Supabase; un proceso lo mueve al NAS (igual que las fotos). Tabla aparte de
-- monitor_capturas para no mezclar con las fotos ni tocar su pipeline.
create table if not exists public.monitor_clips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  path        text not null,              -- clave en el buzón (bucket monitor-capturas)
  nas_path    text,                        -- clave en el NAS una vez movido
  en_nas      boolean not null default false,
  dur_seg     integer,                     -- duración real del clip
  motivo      text,                        -- por qué se grabó: no_mira | se_fue | ...
  con_audio   boolean not null default false,
  room_nombre text,
  created_at  timestamptz not null default now()
);

create index if not exists monitor_clips_user_fecha on public.monitor_clips (user_id, created_at desc);
create index if not exists monitor_clips_buzon on public.monitor_clips (created_at) where nas_path is null;

alter table public.monitor_clips enable row level security;

-- El propio usuario inserta SU fila (igual que monitor_capturas).
create policy monitor_clips_ins_propio on public.monitor_clips
  for insert with check (user_id = (select auth.uid()));
-- Cada quien ve lo suyo; el dueño ve todo (Argos lo ve solo el dueño hoy).
create policy monitor_clips_sel_propio on public.monitor_clips
  for select using (user_id = (select auth.uid()));
create policy monitor_clips_sel_dueno on public.monitor_clips
  for select using (es_dueno((select auth.uid())));
create policy monitor_clips_upd_dueno on public.monitor_clips
  for update using (es_dueno((select auth.uid()))) with check (es_dueno((select auth.uid())));
