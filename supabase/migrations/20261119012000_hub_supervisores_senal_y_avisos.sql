-- EL DUEÑO SE ENTERA DE LO QUE PASA CON LOS SUPERVISORES DEL HUB (Alvaro, 18/11/2026).
--
-- «Llego al Hub y no están, y nadie me dijo si es que no quieren o que falló el
-- sistema.» Hasta hoy:
--   · el vigía «fuera de Cowork» le avisaba al dueño recién al TERCER llamado
--     (~5 min), y los supervisores volvían antes: el 18/11 Vanessa, Breyner y
--     Daniel salieron 9 veces y al dueño no le llegó ninguna;
--   · cámara apagada o pantalla sin compartir (o compartida en NEGRO) no le
--     avisaba a nadie.
--
-- Ahora la app del supervisor manda una SEÑAL cada 30 s mientras está en el Hub
-- (hub_reportar_senal): cámara, qué pasa con la pantalla y por qué, conexión y
-- pausa. Si cierra Maven, lo dice al salir. El vigía de cada minuto
-- (vigilar_supervisores_hub) junta eso con lo que ya sabe la base y, cuando un
-- supervisor en su turno lleva 2 minutos fuera del Hub, sin cámara o sin
-- pantalla, avisa UNA vez por episodio al dueño (destinatarios_de_aviso, como
-- los demás avisos de Cowork) con la CAUSA cuando se sabe:
--   salió / cerró Maven · se le cayó el internet · la app se cayó · se cortó sin
--   aviso · apagó la cámara · quitó la pantalla · pantalla en negro · el Mac no
--   da permiso de pantalla · la pantalla falló.
-- Al supervisor también le llega su aviso. El Hub del dueño muestra el estado de
-- cada uno en vivo (hub_estado_supervisores).
--
-- El grupo de Luis (argos_reglas_persona con pantalla/cámara no obligatoria): solo
-- cuenta «fuera del Hub»; lo que no se les exige no se les reclama.

-- ── La señal que manda la app del supervisor ────────────────────────────────
create table if not exists public.hub_senal (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  session_id     uuid,
  en_hub         boolean not null default true,
  cam_on         boolean not null default false,
  -- compartiendo | apagada (la quitó) | negra | permiso | falla | sin_pedir
  pantalla       text not null default 'sin_pedir'
                 check (pantalla in ('compartiendo', 'apagada', 'negra', 'permiso', 'falla', 'sin_pedir')),
  conexion       text check (conexion in ('conectada', 'reconectando', 'desconectada', 'reemplazada', 'dormido')),
  en_pausa       boolean not null default false,
  -- Cómo se fue, cuando se fue: 'cerro' (cerró Maven o salió del Hub).
  salida         text check (salida in ('cerro')),
  -- Desde cuándo está así (la app lo sabe al segundo; el vigía cuenta 2 min).
  camara_desde   timestamptz,
  pantalla_desde timestamptz,
  conexion_desde timestamptz,
  actualizado    timestamptz not null default now()
);
alter table public.hub_senal enable row level security;
-- Nadie la lee ni la escribe directo: solo por las funciones de abajo.
revoke all on public.hub_senal from anon, authenticated;

create or replace function public.hub_reportar_senal(
  _session_id uuid,
  _en_hub boolean,
  _cam_on boolean,
  _pantalla text,
  _conexion text,
  _en_pausa boolean,
  _salida text default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ant public.hub_senal;
  v_pant text := case when _pantalla in ('compartiendo', 'apagada', 'negra', 'permiso', 'falla', 'sin_pedir') then _pantalla else 'sin_pedir' end;
  v_con text := case when _conexion in ('conectada', 'reconectando', 'desconectada', 'reemplazada', 'dormido') then _conexion end;
begin
  if v_uid is null then return; end if;
  select * into v_ant from public.hub_senal where user_id = v_uid;
  insert into public.hub_senal as h
    (user_id, session_id, en_hub, cam_on, pantalla, conexion, en_pausa, salida, camara_desde, pantalla_desde, conexion_desde, actualizado)
  values (
    v_uid, _session_id, coalesce(_en_hub, false), coalesce(_cam_on, false), v_pant, v_con,
    coalesce(_en_pausa, false), case when _salida = 'cerro' then 'cerro' end,
    now(), now(), now(), now())
  on conflict (user_id) do update set
    session_id     = excluded.session_id,
    en_hub         = excluded.en_hub,
    cam_on         = excluded.cam_on,
    pantalla       = excluded.pantalla,
    conexion       = excluded.conexion,
    en_pausa       = excluded.en_pausa,
    salida         = excluded.salida,
    -- El «desde» solo se mueve cuando el dato cambia.
    camara_desde   = case when v_ant.cam_on is distinct from excluded.cam_on then now() else h.camara_desde end,
    pantalla_desde = case when v_ant.pantalla is distinct from excluded.pantalla then now() else h.pantalla_desde end,
    conexion_desde = case when v_ant.conexion is distinct from excluded.conexion then now() else h.conexion_desde end,
    actualizado    = now();
end;
$$;
revoke all on function public.hub_reportar_senal(uuid, boolean, boolean, text, text, boolean, text) from public, anon;
grant execute on function public.hub_reportar_senal(uuid, boolean, boolean, text, text, boolean, text) to authenticated;

-- ── Los episodios (uno por problema, con su aviso) ──────────────────────────
create table if not exists public.hub_alertas (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  tenant_id   uuid,
  problema    text not null check (problema in ('fuera', 'camara', 'pantalla')),
  causa       text not null,
  desde       timestamptz not null,
  avisado_at  timestamptz,
  hasta       timestamptz
);
create unique index if not exists hub_alertas_una_abierta
  on public.hub_alertas (user_id, problema) where hasta is null;
create index if not exists hub_alertas_desde on public.hub_alertas (desde desc);
alter table public.hub_alertas enable row level security;
revoke all on public.hub_alertas from anon, authenticated;

-- ── Qué le pasa a cada supervisor ahora mismo (sin escribir nada) ────────────
-- Una fila por problema vigente. La usan el vigía y el Hub del dueño.
create or replace function public.hub_problemas_ahora(_ahora timestamptz default now())
returns table (user_id uuid, tenant_id uuid, problema text, causa text, desde timestamptz)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with sup as (
    select p.id as uid, tm.tenant_id,
           coalesce(r.pantalla_obligatoria, true) as exige_pantalla,
           coalesce(r.camara_obligatoria, true) as exige_camara,
           s.en_hub, s.cam_on, s.pantalla, s.conexion, s.en_pausa, s.salida,
           s.camara_desde, s.pantalla_desde, s.conexion_desde, s.actualizado,
           -- Señal viva: llegó hace menos de 90 s.
           (s.actualizado is not null and s.actualizado > _ahora - interval '90 seconds') as viva
      from public.profiles p
      join lateral (select m.tenant_id from public.tenant_members m where m.user_id = p.id limit 1) tm on true
      left join public.argos_reglas_persona r on r.user_id = p.id
      left join public.hub_senal s on s.user_id = p.id
     where p.deleted_at is null
       and public.argos_vigila_a(p.id)
       -- Los del Hub: supervisores y jefes, o quien mandó señal del Hub hoy.
       and (p.nivel in ('supervisor', 'manager') or s.actualizado > _ahora - interval '12 hours')
       and exists (select 1 from public.turno_en_curso(p.id, _ahora))
       and not coalesce((select h.exento from public.horario_de(p.id) h), false)
  ),
  ultimo_seg as (
    select s.user_id, max(coalesce(s.ended_at, s.last_seen_at)) as ultimo,
           bool_or(s.ended_at is null and s.estado = 'pausa' and s.last_seen_at > _ahora - interval '90 seconds') as pausa_abierta
      from public.cowork_tiempo_segmentos s
     where s.user_id in (select uid from sup)
       and coalesce(s.ended_at, s.last_seen_at) > _ahora - interval '12 hours'
     group by s.user_id
  )
  -- 1a) En el Hub pero la llamada CAÍDA (la app sigue viva y reintentando sola,
  --     useLiveKit nunca se rinde): para el dueño es lo mismo que no estar, y la
  --     causa es el internet (o el computador dormido).
  select sup.uid, sup.tenant_id, 'fuera'::text,
         case when sup.conexion = 'dormido' then 'equipo_dormido' else 'conexion' end,
         sup.conexion_desde
    from sup
   where sup.viva and sup.en_hub and sup.conexion in ('desconectada', 'dormido')
  union all
  -- 1b) Fuera del Hub: ni señal viva en el Hub ni presente en Cowork (una sala,
  --     un Meet de Maven o una pausa abierta cuentan como presente).
  select sup.uid, sup.tenant_id, 'fuera'::text,
         case
           when sup.salida = 'cerro' then 'salio'
           when exists (select 1 from public.app_caidas a where a.user_id = sup.uid and a.creado > _ahora - interval '15 minutes') then 'app_caida'
           when sup.conexion in ('reconectando', 'desconectada')
             or exists (select 1 from public.llamada_cortes c where c.user_id = sup.uid and c.fase = 'caida' and c.creado > _ahora - interval '15 minutes')
             then 'conexion'
           when sup.conexion = 'dormido' then 'equipo_dormido'
           else 'sin_senal'
         end,
         greatest(coalesce(sup.actualizado, '-infinity'::timestamptz), coalesce(us.ultimo, '-infinity'::timestamptz))
    from sup
    left join ultimo_seg us on us.user_id = sup.uid
   where not (sup.viva and sup.en_hub)
     and not public.presente_en_cowork(sup.uid, _ahora)
     -- Nunca entró hoy: eso ya lo avisa «no ha entrado a Cowork».
     and (sup.actualizado is not null or us.ultimo is not null)
  union all
  -- 2) En el Hub, sin cámara (si se le exige).
  select sup.uid, sup.tenant_id, 'camara', 'camara_apagada', sup.camara_desde
    from sup
    left join ultimo_seg us on us.user_id = sup.uid
   where sup.viva and sup.en_hub and sup.exige_camara
     and not sup.cam_on and not sup.en_pausa and not coalesce(us.pausa_abierta, false)
     and coalesce(sup.conexion, 'conectada') = 'conectada'
  union all
  -- 3) En el Hub, sin pantalla o con la pantalla en negro (si se le exige).
  select sup.uid, sup.tenant_id, 'pantalla',
         case sup.pantalla
           when 'apagada' then 'pantalla_apagada'
           when 'negra' then 'pantalla_negra'
           when 'permiso' then 'permiso_pantalla'
           when 'falla' then 'pantalla_falla'
           else 'pantalla_sin_compartir'
         end,
         sup.pantalla_desde
    from sup
    left join ultimo_seg us on us.user_id = sup.uid
   where sup.viva and sup.en_hub and sup.exige_pantalla
     and sup.pantalla <> 'compartiendo' and not sup.en_pausa and not coalesce(us.pausa_abierta, false)
     and coalesce(sup.conexion, 'conectada') = 'conectada';
$$;
revoke all on function public.hub_problemas_ahora(timestamptz) from public, anon, authenticated;

-- El texto de cada causa, para el aviso.
create or replace function public.hub_texto_causa(_causa text)
returns text
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select case _causa
    when 'salio' then 'Se salió del Hub o cerró Maven (no fue una caída).'
    when 'app_caida' then 'La app de Maven se le cayó (falla del sistema, no lo hizo a propósito).'
    when 'conexion' then 'Se le cayó el internet (falla de conexión, no lo hizo a propósito).'
    when 'equipo_dormido' then 'Su computador se durmió o se bloqueó.'
    when 'sin_senal' then 'Se cortó sin aviso: Maven cerrado a la fuerza, el computador apagado o sin internet.'
    when 'camara_apagada' then 'Tiene la cámara apagada.'
    when 'pantalla_apagada' then 'Quitó la pantalla compartida a propósito.'
    when 'pantalla_negra' then 'Su pantalla compartida llega en NEGRO (casi siempre es el permiso de «Grabación de pantalla» del Mac).'
    when 'permiso_pantalla' then 'Su computador no le da permiso a Maven para compartir la pantalla.'
    when 'pantalla_falla' then 'La pantalla no se pudo compartir (falla del sistema); Maven la sigue pidiendo sola.'
    when 'pantalla_sin_compartir' then 'No está compartiendo la pantalla.'
    else 'No está compartiendo la pantalla.'
  end;
$$;

-- ── El vigía (cada minuto) ──────────────────────────────────────────────────
create or replace function public.vigilar_supervisores_hub()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  r record;
  v_ahora timestamptz := now();
  v_avisos int := 0;
  v_nom text;
  v_min int;
  v_titulo text;
begin
  -- 1) Abrir o actualizar episodios con lo que pasa ahora.
  drop table if exists _hub_ahora;
  create temp table _hub_ahora on commit drop as
    select * from public.hub_problemas_ahora(v_ahora);

  -- 2) Cerrar lo que se arregló.
  update public.hub_alertas a set hasta = v_ahora
   where a.hasta is null
     and not exists (select 1 from _hub_ahora h where h.user_id = a.user_id and h.problema = a.problema);

  -- 3) Abrir lo nuevo; si la causa cambió (p. ej. «sin señal» → «se cayó la
  --    app» cuando la app vuelve y lo anota), se corrige sin volver a avisar.
  insert into public.hub_alertas (user_id, tenant_id, problema, causa, desde)
  select h.user_id, h.tenant_id, h.problema, h.causa, least(coalesce(h.desde, v_ahora), v_ahora)
    from _hub_ahora h
  on conflict (user_id, problema) where hasta is null
  do update set causa = excluded.causa;

  -- 4) Avisar a los 2 minutos, una vez por episodio.
  for r in
    select a.id, a.user_id, a.problema, a.causa, a.desde, p.full_name
      from public.hub_alertas a
      join public.profiles p on p.id = a.user_id
     where a.hasta is null and a.avisado_at is null
       and a.desde <= v_ahora - interval '2 minutes'
  loop
    v_nom := coalesce(nullif(trim(r.full_name), ''), 'Un supervisor');
    v_min := greatest(2, round(extract(epoch from (v_ahora - r.desde)) / 60))::int;
    v_titulo := case r.problema
      when 'fuera' then format('%s no está en el Supervisor Hub', v_nom)
      when 'camara' then format('%s está sin cámara en el Hub', v_nom)
      else format('%s no está compartiendo pantalla en el Hub', v_nom)
    end;

    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    select d.user_id, 'hub_supervisor', v_titulo,
           format('Lleva %s min así, en su turno. Causa: %s', v_min, public.hub_texto_causa(r.causa)),
           r.user_id, 'profile', 'Cowork', 'high', 'new', 'personal',
           format('/hr/en-vivo/%s', r.user_id)
      from public.destinatarios_de_aviso(r.user_id) d;

    insert into public.notifications
      (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (r.user_id, 'hub_supervisor_tu',
            case r.problema
              when 'fuera' then 'No estás en el Supervisor Hub'
              when 'camara' then 'Tu cámara está apagada en el Hub'
              else 'Tu pantalla no se está compartiendo en el Hub'
            end,
            format('Llevas %s min así y ya se le avisó al dueño. %s', v_min, public.hub_texto_causa(r.causa)),
            'cowork', 'Cowork', 'high', 'new', 'personal', '/cowork');

    update public.hub_alertas set avisado_at = v_ahora where id = r.id;
    v_avisos := v_avisos + 1;
  end loop;

  -- Lo viejo no sirve: 30 días.
  delete from public.hub_alertas where hasta < v_ahora - interval '30 days';
  return v_avisos;
end;
$$;
revoke all on function public.vigilar_supervisores_hub() from public, anon, authenticated;

-- ── El estado en vivo para el Hub del dueño ─────────────────────────────────
-- Una fila por supervisor del Hub en su turno: 'ok' o el problema con su causa.
-- Solo para quien ve a Argos (dueño, admins, RR. HH.); sin permiso lanza 42501
-- para que la pantalla no diga «todos bien».
create or replace function public.hub_estado_supervisores()
returns table (user_id uuid, nombre text, problema text, causa text, desde timestamptz, texto text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if not coalesce(public.ve_argos(), false) then
    raise exception 'hub_estado_supervisores: sin permiso' using errcode = '42501';
  end if;
  return query
  with prob as (
    select * from public.hub_problemas_ahora(now()) h where h.tenant_id = v_tenant
  ),
  gente as (
    select p.id, p.full_name
      from public.profiles p
      join public.tenant_members m on m.user_id = p.id and m.tenant_id = v_tenant
      left join public.hub_senal s on s.user_id = p.id
     where p.deleted_at is null
       and public.argos_vigila_a(p.id)
       and (p.nivel in ('supervisor', 'manager') or s.actualizado > now() - interval '12 hours')
       and exists (select 1 from public.turno_en_curso(p.id, now()))
  )
  select g.id, g.full_name,
         coalesce(pr.problema, 'ok'), pr.causa, pr.desde,
         case when pr.causa is null then null else public.hub_texto_causa(pr.causa) end
    from gente g
    left join lateral (
      select * from prob where prob.user_id = g.id
       order by case prob.problema when 'fuera' then 0 when 'pantalla' then 1 else 2 end
       limit 1
    ) pr on true
   order by g.full_name;
end;
$$;
revoke all on function public.hub_estado_supervisores() from public, anon;
grant execute on function public.hub_estado_supervisores() to authenticated;

-- ── Cada minuto ─────────────────────────────────────────────────────────────
select cron.unschedule('vigia-supervisores-hub')
 where exists (select 1 from cron.job where jobname = 'vigia-supervisores-hub');
select cron.schedule('vigia-supervisores-hub', '* * * * *', $$ select public.vigilar_supervisores_hub(); $$);
