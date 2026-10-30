-- Monitor de cámara por IA para Cowork (Álvaro, 30/10/2026).
--
-- QUÉ ES: un monitor de RRHH que vigila, en el navegador de cada persona de
-- Cowork, que trabaje con la cámara prendida y atendiendo. Marca cuatro cosas:
--   · cámara apagada o tapada                (GRATIS, del detector de encuadre)
--   · se fue del puesto / no hay nadie       (GRATIS, del detector de encuadre)
--   · cara incompleta / muy lejos            (GRATIS, del detector de encuadre)
--   · en el celular / distraído / no mira    (IA de visión, cada ~2 min)
--
-- Las tres primeras ya las sabe `useFaceWatch` (BlazeFace en el navegador), así
-- que acá se REGISTRAN como faltas; la cuarta la juzga una IA de visión (edge
-- `monitor-vision`, OpenRouter — la misma stack que ya lee las imágenes de
-- WhatsApp, sin llave nueva).
--
-- A QUIÉN: a todos los de Cowork MENOS los admins (el dueño es admin). Los
-- supervisores también se monitorean. El cliente excluye admins y el edge lo
-- vuelve a validar del lado servidor.
--
-- REVERSIBLE: nada destructivo. Apagar = `monitor_config.activo = false` (o
-- borrar estas tablas). Las capturas de IA viven en un bucket privado.

-- ───────────────────────── Interruptor / ajustes ─────────────────────────
-- Una sola fila. El admin la edita desde la página de RRHH; el navegador la lee
-- para saber si capturar y cada cuánto. No es sensible: cualquier logueado la lee.
create table if not exists public.monitor_config (
  id                smallint primary key default 1,
  activo            boolean  not null default true,   -- apaga/prende TODO el monitor
  intervalo_ia_seg  integer  not null default 120,    -- cada cuánto mira la IA (segundos)
  avisar_supervisor boolean  not null default true,   -- campana/push al supervisor por falta
  updated_at        timestamptz not null default now(),
  updated_by        uuid,
  constraint monitor_config_una_fila check (id = 1)
);
insert into public.monitor_config (id) values (1) on conflict (id) do nothing;

alter table public.monitor_config enable row level security;

create policy "monitor_config_read" on public.monitor_config
  for select to authenticated using (true);

create policy "monitor_config_admin_update" on public.monitor_config
  for update to authenticated
  using (public.is_in_role_group((select auth.uid()), 'admin'))
  with check (public.is_in_role_group((select auth.uid()), 'admin'));

-- ───────────────────────── Registro de faltas ─────────────────────────
create table if not exists public.monitor_eventos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,                                 -- la persona monitoreada
  room_nombre text,                                          -- nombre de la sala de LiveKit
  session_id  uuid references public.cowork_sessions(id) on delete set null,
  tipo        text not null,   -- camara_apagada|camara_tapada|se_fue|cara_incompleta|celular|distraido|no_mira
  fuente      text not null default 'local',                 -- 'local' (gratis) | 'ia'
  detalle     text,                                          -- texto del veredicto / contexto
  confianza   real,                                          -- 0..1 (solo IA)
  captura_path text,                                         -- ruta en bucket monitor-capturas (solo IA)
  created_at  timestamptz not null default now()
);

-- Lecturas típicas: "lo reciente de una persona" y "lo reciente de todos".
create index if not exists monitor_eventos_user_fresh_idx
  on public.monitor_eventos (user_id, created_at desc);
create index if not exists monitor_eventos_fresh_idx
  on public.monitor_eventos (created_at desc);

alter table public.monitor_eventos enable row level security;

-- Cada quien registra SUS propias faltas gratis (el detector corre en su navegador).
-- Las de IA las escribe el edge con service_role (salta RLS). Nunca a nombre de otro.
create policy "monitor_eventos_insert_propio" on public.monitor_eventos
  for insert to authenticated
  with check (user_id = (select auth.uid()) and fuente = 'local');

-- Los supervisores y admins ven todo (es su panel de RRHH).
create policy "monitor_eventos_select_supervisor" on public.monitor_eventos
  for select to authenticated
  using (public.is_in_role_group((select auth.uid()), 'supervisor_or_above'));

-- La persona ve lo suyo (transparencia: puede ver qué se le marcó).
create policy "monitor_eventos_select_propio" on public.monitor_eventos
  for select to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.monitor_eventos;

-- ───────────────────────── Capturas de la IA (bucket privado) ─────────────────────────
insert into storage.buckets (id, name, public)
values ('monitor-capturas', 'monitor-capturas', false)
on conflict (id) do nothing;

-- Solo supervisores/admin ven las capturas; las sube el edge con service_role.
create policy "monitor_capturas_read_supervisor" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'monitor-capturas'
    and public.is_in_role_group((select auth.uid()), 'supervisor_or_above')
  );

-- ───────────────────────── Aviso al supervisor (campana/push) ─────────────────────────
-- Al registrar una falta SERIA, avisa a los supervisores por la campana (y, si
-- tienen push, al celular). Antiráfaga fuerte: como MUCHO un aviso por persona
-- monitoreada cada 15 min, para no reventar los teléfonos. Se apaga con
-- monitor_config.avisar_supervisor = false. El panel en vivo de RRHH no depende
-- de esto: siempre muestra todo.
create or replace function public.notificar_supervisores_monitor()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_avisar boolean;
  v_nombre text;
  v_titulo text;
  v_detalle text;
  sup record;
begin
  -- Solo faltas serias disparan aviso; las menores (cara incompleta, poca luz)
  -- quedan en el registro pero no suenan.
  if new.tipo not in ('camara_apagada', 'se_fue', 'celular', 'distraido', 'no_mira') then
    return new;
  end if;

  select avisar_supervisor into v_avisar from public.monitor_config where id = 1;
  if coalesce(v_avisar, false) = false then
    return new;
  end if;

  -- Antiráfaga: una sola notificación por persona monitoreada cada 15 min.
  if exists (
    select 1 from public.notifications n
    where n.type = 'monitor_ia'
      and n.reference_id = new.user_id::text
      and n.created_at > now() - interval '15 minutes'
  ) then
    return new;
  end if;

  select full_name into v_nombre from public.profiles where id = new.user_id;
  v_detalle := case new.tipo
    when 'camara_apagada' then 'tiene la cámara apagada'
    when 'se_fue'         then 'no está frente a la cámara'
    when 'celular'        then 'parece estar en el celular'
    when 'distraido'      then 'se ve distraído'
    when 'no_mira'        then 'no está mirando la pantalla'
    else new.tipo
  end;
  v_titulo := coalesce(v_nombre, 'Alguien') || ' ' || v_detalle;

  for sup in
    select distinct ur.user_id
    from public.user_roles ur
    join public.role_groups rg on rg.role_name = ur.role
    where rg.is_supervisor_or_above
      and ur.user_id <> new.user_id          -- al que se marca no se le avisa a sí mismo
  loop
    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, deep_link_url, priority)
    values
      (sup.user_id, 'monitor_ia', 'Monitor de cámara', v_titulo,
       new.user_id::text, 'monitor_evento', 'HR', '/hr/monitor-ia', 'high');
  end loop;

  return new;
exception
  -- Avisar NUNCA debe bloquear el registro de la falta: si algo del aviso falla
  -- (una columna, un push), la fila de monitor_eventos igual se guarda.
  when others then
    return new;
end;
$$;

create trigger trg_monitor_notifica
  after insert on public.monitor_eventos
  for each row execute function public.notificar_supervisores_monitor();
