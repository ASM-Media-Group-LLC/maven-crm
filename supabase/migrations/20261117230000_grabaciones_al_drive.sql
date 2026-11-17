-- Las grabaciones de Meet y Cowork se guardan también en el Drive de Maven
-- (Alvaro, 17/11/2026). Hasta hoy el MP4 vivía solo en R2 / el disco del VPS
-- de LiveKit y se borraba a los 90 días sin excepciones.
--
-- Cómo funciona:
--   1. Cuando una grabación queda lista (status → 'ready', venga de Detener, del
--      webhook de LiveKit o del barrido de huérfanas), el trigger la pone en la
--      fila `grabaciones_al_drive`.
--   2. Cada 2 minutos, si hay algo en la fila, el tic despierta la edge
--      `grabaciones-al-drive`, que copia el MP4 al NAS por partes de 32 MB
--      (resumible entre rondas, como los aportes del link público) y crea la
--      ficha en el Drive de quien grabó: Grabaciones/<año-mes>/<sala> <fecha>.mp4.
--   3. Al terminar, la comparte como lectura (drive_shares) con quien estuvo en
--      la llamada y con quien la recibió al pararla, siempre de la misma
--      agencia (lo exige el trigger drive_shares_misma_agencia).
--   4. En el Drive dura 30 DÍAS desde que se copia (Alvaro, 17/11/2026). A quien
--      grabó se le avisa (campana + correo) al copiarse y 3 días antes de
--      vencer; puede pedir «Guardar 30 días más» (grabacion_drive_extender),
--      las veces que quiera. Al vencer, la misma edge la borra del NAS y del
--      Drive (estado 'vencido').
--
-- Quién estuvo en la llamada: `meeting_recording_participantes`, que se llena
-- al empezar a grabar, al parar, en el barrido y con cada `participant_joined`
-- del webhook de LiveKit mientras la sala se está grabando.

-- ── Quién estuvo en la llamada mientras se grababa ──────────────────────────
create table if not exists public.meeting_recording_participantes (
  recording_id uuid not null references public.meeting_recordings(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  visto_at     timestamptz not null default now(),
  primary key (recording_id, user_id)
);

-- Solo la usan las edges (service_role): con RLS prendida y sin políticas,
-- nadie más la lee ni la escribe.
alter table public.meeting_recording_participantes enable row level security;
revoke all on public.meeting_recording_participantes from anon, authenticated;

/** Anota a estas personas en la grabación EN CURSO de la sala (si la hay). */
create or replace function public.grabacion_anotar_participantes(p_sala text, p_usuarios uuid[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_n integer;
begin
  if p_sala is null or p_usuarios is null or cardinality(p_usuarios) = 0 then
    return 0;
  end if;
  insert into public.meeting_recording_participantes (recording_id, user_id)
  select r.id, u.id
  from public.meeting_recordings r
  cross join lateral (select distinct x as id from unnest(p_usuarios) x) q
  join auth.users u on u.id = q.id
  where r.room_name = p_sala
    and r.status = 'recording'
    and r.deleted_at is null
  on conflict (recording_id, user_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.grabacion_anotar_participantes(text, uuid[]) from public, anon, authenticated;
grant execute on function public.grabacion_anotar_participantes(text, uuid[]) to service_role;

-- ── La fila de copias al Drive ──────────────────────────────────────────────
create table if not exists public.grabaciones_al_drive (
  recording_id  uuid primary key references public.meeting_recordings(id) on delete cascade,
  estado        text not null default 'pendiente'
                check (estado in ('pendiente', 'subiendo', 'juntando', 'listo', 'fallo', 'cancelado', 'vencido')),
  drive_item_id uuid references public.drive_items(id) on delete set null,
  nas_up        uuid,
  nas_parte     integer not null default 0,
  size          bigint,
  intentos      integer not null default 0,
  error         text,
  juntando_at   timestamptz,
  -- Hasta cuándo queda en el Drive (30 días desde la copia; +30 por extensión).
  vence_drive_at   timestamptz,
  avisado_vence_at timestamptz,   -- ya se avisó que vence (se limpia al extender)
  extensiones      integer not null default 0,
  -- Una sola ronda a la vez (ver grabaciones_al_drive_tomar).
  tomado_hasta  timestamptz,
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now()
);

create index if not exists grabaciones_al_drive_pendientes
  on public.grabaciones_al_drive (creado)
  where estado in ('pendiente', 'subiendo', 'juntando');

create index if not exists grabaciones_al_drive_por_vencer
  on public.grabaciones_al_drive (vence_drive_at)
  where estado = 'listo';

alter table public.grabaciones_al_drive enable row level security;
revoke all on public.grabaciones_al_drive from anon, authenticated;
-- /grabaciones muestra «En el Drive hasta…»: cada uno ve la copia de las
-- grabaciones que ya puede ver (la RLS de meeting_recordings decide adentro de
-- la subconsulta). Solo lectura y solo estas columnas; escribir, por la edge
-- o por grabacion_drive_extender.
grant select (recording_id, estado, drive_item_id, vence_drive_at, extensiones) on public.grabaciones_al_drive to authenticated;
drop policy if exists grabaciones_al_drive_ver on public.grabaciones_al_drive;
create policy grabaciones_al_drive_ver on public.grabaciones_al_drive
  for select to authenticated
  using (exists (select 1 from public.meeting_recordings m where m.id = grabaciones_al_drive.recording_id));

/** «Guardar 30 días más»: quien grabó (o un admin de la misma agencia). Suma
 *  30 días a lo que le quedaba —o a hoy, si ya venció y aún no se borró— y
 *  vuelve a armar el aviso de vencimiento. Devuelve el nuevo vencimiento. */
create or replace function public.grabacion_drive_extender(p_recording uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_yo uuid := (select auth.uid());
  v_rec public.meeting_recordings%rowtype;
  v_vence timestamptz;
begin
  if v_yo is null then
    raise exception 'Sin sesión' using errcode = '42501';
  end if;
  select * into v_rec from public.meeting_recordings where id = p_recording;
  if not found or v_rec.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Grabación no encontrada' using errcode = 'P0002';
  end if;
  if v_rec.started_by is distinct from v_yo and not public.has_role(v_yo, 'admin'::text) then
    raise exception 'Solo quien grabó puede guardarla más tiempo' using errcode = '42501';
  end if;
  update public.grabaciones_al_drive
     set vence_drive_at = greatest(coalesce(vence_drive_at, now()), now()) + interval '30 days',
         avisado_vence_at = null,
         extensiones = extensiones + 1,
         actualizado = now()
   where recording_id = p_recording and estado = 'listo'
  returning vence_drive_at into v_vence;
  if v_vence is null then
    raise exception 'La grabación no está en el Drive' using errcode = 'P0002';
  end if;
  return v_vence;
end;
$$;

revoke all on function public.grabacion_drive_extender(uuid) from public, anon;
grant execute on function public.grabacion_drive_extender(uuid) to authenticated;

-- Toda grabación que queda lista entra a la fila, venga de donde venga.
create or replace function public.grabacion_a_la_fila_del_drive()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status = 'ready' and new.deleted_at is null and new.storage_key is not null then
    insert into public.grabaciones_al_drive (recording_id)
    values (new.id)
    on conflict (recording_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.grabacion_a_la_fila_del_drive() from public, anon, authenticated;

drop trigger if exists grabacion_a_la_fila_del_drive on public.meeting_recordings;
create trigger grabacion_a_la_fila_del_drive
  after insert or update of status on public.meeting_recordings
  for each row execute function public.grabacion_a_la_fila_del_drive();

/** Reclama hasta p_limite copias pendientes para UNA ronda. Si otra ronda
 *  todavía las tiene tomadas, no devuelve nada: dos rondas a la vez podrían
 *  crear dos carpetas «Grabaciones» para la misma persona. El permiso vence
 *  solo (p_segundos) si la edge se cae a mitad de camino. */
create or replace function public.grabaciones_al_drive_tomar(p_limite integer default 5, p_segundos integer default 240)
returns setof public.grabaciones_al_drive
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform pg_advisory_xact_lock(hashtext('grabaciones_al_drive'));
  if exists (
    select 1 from public.grabaciones_al_drive
    where tomado_hasta > now() and estado in ('pendiente', 'subiendo', 'juntando')
  ) then
    return;
  end if;
  return query
  update public.grabaciones_al_drive g
     set tomado_hasta = now() + make_interval(secs => p_segundos)
   where g.recording_id in (
     select recording_id from public.grabaciones_al_drive
     where estado in ('pendiente', 'subiendo', 'juntando')
     -- Las que vienen fallando van al final: un archivo que no aparece no
     -- frena a las demás.
     order by intentos, creado
     limit greatest(1, least(p_limite, 20))
   )
  returning g.*;
end;
$$;

revoke all on function public.grabaciones_al_drive_tomar(integer, integer) from public, anon, authenticated;
grant execute on function public.grabaciones_al_drive_tomar(integer, integer) to service_role;

-- ── El tic: despierta la edge solo si hay algo que copiar ────────────────────
-- Mismo patrón que cerrar_grabaciones_huerfanas_tick: casi siempre termina en
-- el `exists` de abajo y no despierta a nadie.
create or replace function public.grabaciones_al_drive_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token text;
begin
  -- Algo que copiar, o una copia por vencer (aviso) o vencida (borrar).
  if not exists (
    select 1 from public.grabaciones_al_drive
    where estado in ('pendiente', 'subiendo', 'juntando')
      and (tomado_hasta is null or tomado_hasta < now())
  ) and not exists (
    select 1 from public.grabaciones_al_drive
    where estado = 'listo'
      and (vence_drive_at <= now()
           or (avisado_vence_at is null and vence_drive_at <= now() + interval '3 days'))
  ) then
    return jsonb_build_object('despertada', false);
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'cron_internal_token';

  if v_token is null then
    return jsonb_build_object('despertada', false, 'error', 'falta el secreto cron_internal_token en vault');
  end if;

  perform net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/grabaciones-al-drive',
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Token', v_token),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  return jsonb_build_object('despertada', true);
end;
$$;

revoke all on function public.grabaciones_al_drive_tick() from public, anon, authenticated;

select cron.schedule(
  'grabaciones-al-drive',
  '*/2 * * * *',
  $$select public.grabaciones_al_drive_tick();$$
);
