-- Centro de anuncios de voz (/announcements): el admin controla QUÉ dice la
-- plataforma y con qué VOZ. El texto por defecto vive en el frontend
-- (lib/anuncios.ts); esta tabla guarda SOLO lo que el admin cambió (overrides)
-- y la voz elegida, por agencia. El audio bonito (ElevenLabs) se cachea en el
-- bucket 'anuncios-voz' por hash del texto+voz, para no re-generar ni pagar dos
-- veces lo mismo.

create table if not exists public.announcement_overrides (
  tenant_id   uuid primary key default public.current_tenant_id() references public.tenants(id) on delete cascade,
  -- { "<clave>": ["frase 1", "frase 2", ...] } — solo las claves que el admin tocó.
  phrases     jsonb not null default '{}'::jsonb,
  -- Voz de ElevenLabs para TODOS los anuncios de esta agencia. Default: Mario Deep.
  voice_id    text  not null default '6yXdJiDseQt6BOet0rXz',
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

alter table public.announcement_overrides enable row level security;

-- Cada agencia ve y edita SOLO lo suyo (RLS pone/filtra el tenant_id solo).
drop policy if exists announcement_overrides_select on public.announcement_overrides;
create policy announcement_overrides_select on public.announcement_overrides
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists announcement_overrides_mutate on public.announcement_overrides;
create policy announcement_overrides_mutate on public.announcement_overrides
  for all using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- Bucket público para el audio cacheado (archivos <hash>.mp3). Público para que
-- el <audio> de la app lo reproduzca directo; el nombre es un hash, no se lista.
insert into storage.buckets (id, name, public)
values ('anuncios-voz', 'anuncios-voz', true)
on conflict (id) do nothing;

-- Cualquiera autenticado puede LEER el audio cacheado (es su propia agencia quien
-- lo reproduce; el contenido no es sensible). Solo el service_role (la edge
-- function) ESCRIBE: no hay policy de insert para usuarios, así que nadie más sube.
drop policy if exists anuncios_voz_read on storage.objects;
create policy anuncios_voz_read on storage.objects
  for select using (bucket_id = 'anuncios-voz');
