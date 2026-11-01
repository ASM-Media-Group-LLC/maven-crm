-- Capturas periódicas de Argos (pantalla + cámara) desde lo que la persona YA
-- comparte en Cowork. Cada ~1 min; se guardan 30 días y alimentan el expediente
-- del empleado (calendario "qué hizo cada día"). El pantallazo además lo analiza
-- la IA: si está en algo fuera de lugar, se marca como falta con la prueba.
-- Alvaro, 31/10/2026.

create table if not exists public.monitor_capturas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  tipo          text not null check (tipo in ('pantalla','camara')),
  path          text not null,                 -- ruta en bucket monitor-capturas
  room_nombre   text,
  -- análisis de IA (solo pantallazos): ¿está en algo que no tiene que ver?
  analizado     boolean not null default false,
  fuera_de_lugar boolean,
  veredicto     text,
  created_at    timestamptz not null default now()
);
create index if not exists monitor_capturas_user_fresh_idx on public.monitor_capturas (user_id, created_at desc);
create index if not exists monitor_capturas_fresh_idx on public.monitor_capturas (created_at);

alter table public.monitor_capturas enable row level security;

create policy "monitor_capturas_ins_propio" on public.monitor_capturas
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "monitor_capturas_sel_propio" on public.monitor_capturas
  for select to authenticated using (user_id = (select auth.uid()));
create policy "monitor_capturas_sel_supervisor" on public.monitor_capturas
  for select to authenticated using (public.is_in_role_group((select auth.uid()), 'supervisor_or_above'));
create policy "monitor_capturas_upd_supervisor" on public.monitor_capturas
  for update to authenticated
  using (public.is_in_role_group((select auth.uid()), 'supervisor_or_above'))
  with check (public.is_in_role_group((select auth.uid()), 'supervisor_or_above'));

do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin alter publication supabase_realtime add table public.monitor_capturas; exception when duplicate_object then null; end;
  end if;
end $$;

-- Subida al bucket privado monitor-capturas: la persona sube a SU carpeta (user_id/...).
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name='storage') then
    begin
      create policy "monitor_capturas_upload_propio" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'monitor-capturas' and (storage.foldername(name))[1] = (select auth.uid())::text);
    exception when duplicate_object then null; end;
  end if;
end $$;

-- Retención 30 días (si hay pg_cron).
do $$ begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('monitor-capturas-limpieza', '0 4 * * *',
      $cron$
        delete from storage.objects where bucket_id='monitor-capturas' and created_at < now() - interval '30 days';
        delete from public.monitor_capturas where created_at < now() - interval '30 days';
      $cron$);
  end if;
end $$;
