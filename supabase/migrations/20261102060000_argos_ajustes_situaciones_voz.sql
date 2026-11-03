-- AJUSTES de Argos editables por el dueño (Álvaro, 02/11): qué dice Argos en cada
-- situación, cuántos minutos espera, a quién avisa, y qué VOZ usa. Todo en un lugar.
create table if not exists public.argos_situaciones (
  tipo              text primary key,
  activa            boolean not null default true,
  umbral_min        integer not null default 10,
  mensaje           text not null,
  avisar_persona    boolean not null default true,
  avisar_supervisor boolean not null default true,
  avisar_dueno      boolean not null default true,
  orden             integer not null default 0,
  updated_at        timestamptz not null default now(),
  updated_by        uuid
);
create table if not exists public.argos_voz (
  id              smallint primary key default 1,
  voz_es          text not null default 'Mario',
  voz_en          text not null default 'Mario',
  intro_locutora  boolean not null default true,
  updated_at      timestamptz not null default now(),
  updated_by      uuid,
  constraint argos_voz_una_fila check (id = 1)
);
insert into public.argos_situaciones (tipo, umbral_min, mensaje, orden) values
  ('sin_pantalla',   10, '{nombre}, comparte tu pantalla, por favor. Argos no puede ver en qué trabajas.', 1),
  ('camara_apagada',  5, '{nombre}, enciende tu cámara. Recuerda que debe estar prendida mientras trabajas.', 2),
  ('fuera_de_lugar',  1, '{nombre}, vuelve a tu trabajo. Argos detectó que no estás en una herramienta de la agencia.', 3),
  ('se_fue',          5, '{nombre}, te necesitamos frente a la cámara, atendiendo.', 4)
on conflict (tipo) do nothing;
insert into public.argos_voz (id) values (1) on conflict (id) do nothing;
alter table public.argos_situaciones enable row level security;
alter table public.argos_voz enable row level security;
create policy argos_situaciones_sel on public.argos_situaciones for select using (es_dueno((select auth.uid())));
create policy argos_situaciones_upd on public.argos_situaciones for update using (es_dueno((select auth.uid()))) with check (es_dueno((select auth.uid())));
create policy argos_voz_sel on public.argos_voz for select using (es_dueno((select auth.uid())));
create policy argos_voz_upd on public.argos_voz for update using (es_dueno((select auth.uid()))) with check (es_dueno((select auth.uid())));
