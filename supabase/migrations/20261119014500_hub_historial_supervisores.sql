-- EL HISTORIAL DEL HUB POR SUPERVISOR, EN ARGOS (Alvaro, 19/11/2026).
--
-- «Quiero saber si lo apagan a propósito o si falla el sistema.» El aviso de
-- los 2 minutos (20261119012000) dice lo que pasa AHORA; esto guarda TODO lo
-- que pasó, con la hora y la causa, 30 días:
--   · pantalla: empezó a compartir / dejó de compartir — la quitó él (apagada),
--     llega en negro (negra), el Mac no da permiso (permiso), falló (falla) o
--     no la ha pedido (sin_pedir);
--   · cámara: la prendió / la apagó (o la apagó al pausar);
--   · Hub: entró / salió — salió o cerró Maven (salio), se le cayó el internet
--     (conexion), la app se cayó (app_caida), el computador se durmió
--     (equipo_dormido) o se cortó sin aviso (sin_senal: el vigía no recibe su
--     señal hace más de 90 s).
--
-- Se escribe en la BASE, no en el navegador: hub_reportar_senal anota cada
-- cambio contra la señal anterior (solo cambios, nunca la señal repetida de
-- cada 30 s) y el vigía de cada minuto anota la salida de quien se cortó sin
-- avisar. Lo lee hub_historial (pestaña «Historial del Hub» de Argos).

-- ── Los movimientos ─────────────────────────────────────────────────────────
create table if not exists public.hub_eventos (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  tenant_id  uuid,
  tipo       text not null check (tipo in ('pantalla', 'camara', 'hub')),
  -- pantalla: compartiendo | sin_pantalla · camara: prendida | apagada · hub: entro | salio
  valor      text not null,
  causa      text,
  creado     timestamptz not null default now()
);
create index if not exists hub_eventos_user_creado on public.hub_eventos (user_id, creado desc);
create index if not exists hub_eventos_creado on public.hub_eventos (creado);
alter table public.hub_eventos enable row level security;
-- Nadie la lee ni la escribe directo: solo por las funciones de abajo.
revoke all on public.hub_eventos from anon, authenticated;

-- ── Por qué se fue (la misma regla que el aviso, hub_problemas_ahora 1b) ─────
create or replace function public.hub_causa_salida(_uid uuid, _salida text, _conexion text, _ahora timestamptz default now())
returns text
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select case
    when _salida = 'cerro' then 'salio'
    when exists (select 1 from public.app_caidas a where a.user_id = _uid and a.creado > _ahora - interval '15 minutes') then 'app_caida'
    when _conexion in ('reconectando', 'desconectada')
      or exists (select 1 from public.llamada_cortes c where c.user_id = _uid and c.fase = 'caida' and c.creado > _ahora - interval '15 minutes')
      then 'conexion'
    when _conexion = 'dormido' then 'equipo_dormido'
    else 'sin_senal'
  end;
$$;
revoke all on function public.hub_causa_salida(uuid, text, text, timestamptz) from public, anon, authenticated;

-- ── La señal, ahora también anota lo que cambió ─────────────────────────────
-- Misma firma y mismo efecto sobre hub_senal que antes; solo se suman los
-- movimientos. «Dentro del Hub» = en el Hub y con la llamada viva (con la
-- llamada caída o el computador dormido, para el dueño es lo mismo que no estar,
-- como en hub_problemas_ahora 1a).
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
  v_cam boolean := coalesce(_cam_on, false);
  v_dentro boolean;
  v_ult text;
  v_ult_creado timestamptz;
  v_tenant uuid;
  v_cam_ant boolean;
  v_pant_ant text;
begin
  if v_uid is null then return; end if;
  select * into v_ant from public.hub_senal where user_id = v_uid;
  insert into public.hub_senal as h
    (user_id, session_id, en_hub, cam_on, pantalla, conexion, en_pausa, salida, camara_desde, pantalla_desde, conexion_desde, actualizado)
  values (
    v_uid, _session_id, coalesce(_en_hub, false), v_cam, v_pant, v_con,
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

  -- ── El historial: solo lo que cambió ──
  select m.tenant_id into v_tenant from public.tenant_members m where m.user_id = v_uid limit 1;
  v_dentro := coalesce(_en_hub, false) and coalesce(v_con, 'conectada') not in ('desconectada', 'dormido');
  select e.valor, e.creado into v_ult, v_ult_creado from public.hub_eventos e
   where e.user_id = v_uid and e.tipo = 'hub' order by e.creado desc, e.id desc limit 1;

  -- Se había cortado sin avisar y el vigía todavía no lo anotó: la salida va
  -- con la hora de su última señal, antes de la nueva entrada.
  if v_ult = 'entro' and v_ant.actualizado is not null and v_ant.actualizado <= now() - interval '90 seconds' then
    insert into public.hub_eventos (user_id, tenant_id, tipo, valor, causa, creado)
    values (v_uid, v_tenant, 'hub', 'salio', public.hub_causa_salida(v_uid, v_ant.salida, v_ant.conexion, now()),
            greatest(v_ant.actualizado, v_ult_creado));
    v_ult := 'salio';
  end if;

  if v_dentro and v_ult is distinct from 'entro' then
    insert into public.hub_eventos (user_id, tenant_id, tipo, valor) values (v_uid, v_tenant, 'hub', 'entro');
  elsif not v_dentro and v_ult = 'entro' then
    insert into public.hub_eventos (user_id, tenant_id, tipo, valor, causa)
    values (v_uid, v_tenant, 'hub', 'salio',
            case when _salida = 'cerro' then 'salio'
                 when v_con = 'dormido' then 'equipo_dormido'
                 when v_con = 'desconectada' then 'conexion'
                 else 'salio' end);
  end if;

  -- Cámara y pantalla contra la señal anterior. La primera vez se compara con
  -- «todo bien»: solo se anota si llega apagada o sin compartir.
  v_cam_ant := coalesce(v_ant.cam_on, true);
  v_pant_ant := coalesce(v_ant.pantalla, 'compartiendo');
  if v_cam is distinct from v_cam_ant then
    insert into public.hub_eventos (user_id, tenant_id, tipo, valor, causa)
    values (v_uid, v_tenant, 'camara',
            case when v_cam then 'prendida' else 'apagada' end,
            case when v_cam then null when coalesce(_en_pausa, false) then 'pausa' else 'apagada' end);
  end if;
  if v_pant is distinct from v_pant_ant then
    insert into public.hub_eventos (user_id, tenant_id, tipo, valor, causa)
    values (v_uid, v_tenant, 'pantalla',
            case when v_pant = 'compartiendo' then 'compartiendo' else 'sin_pantalla' end,
            case when v_pant = 'compartiendo' then null else v_pant end);
  end if;
end;
$$;
revoke all on function public.hub_reportar_senal(uuid, boolean, boolean, text, text, boolean, text) from public, anon;
grant execute on function public.hub_reportar_senal(uuid, boolean, boolean, text, text, boolean, text) to authenticated;

-- ── El vigía (cada minuto): igual que antes + la salida de quien se cortó ───
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

  -- 5) El historial: quien estaba dentro y lleva más de 90 s sin señal salió.
  --    Va con la hora de su última señal y la mejor causa que se sepa.
  insert into public.hub_eventos (user_id, tenant_id, tipo, valor, causa, creado)
  select s.user_id,
         (select m.tenant_id from public.tenant_members m where m.user_id = s.user_id limit 1),
         'hub', 'salio',
         public.hub_causa_salida(s.user_id, s.salida, s.conexion, v_ahora),
         greatest(s.actualizado, u.creado)
    from public.hub_senal s
    join lateral (
      select e.valor, e.creado from public.hub_eventos e
       where e.user_id = s.user_id and e.tipo = 'hub'
       order by e.creado desc, e.id desc limit 1
    ) u on u.valor = 'entro'
   where s.actualizado <= v_ahora - interval '90 seconds'
     and s.actualizado > v_ahora - interval '1 day';

  -- Lo viejo no sirve: 30 días.
  delete from public.hub_alertas where hasta < v_ahora - interval '30 days';
  delete from public.hub_eventos where creado < v_ahora - interval '30 days';
  return v_avisos;
end;
$$;
revoke all on function public.vigilar_supervisores_hub() from public, anon, authenticated;

-- ── Lo que ve Argos ─────────────────────────────────────────────────────────
-- Un día (hora de Bogotá): los movimientos, el más nuevo arriba, y por
-- supervisor cuántas veces quitó la pantalla él vs. por falla, cuántas apagó la
-- cámara, cuántas salió y los minutos sin pantalla / sin cámara / fuera del Hub
-- (de los episodios del aviso, hub_alertas: solo en su turno y sin pausas).
-- Dueño, admins y RR. HH. ven a todos; un supervisor, solo lo suyo. Sin
-- permiso lanza 42501 para que la pantalla no diga «sin movimientos».
create or replace function public.hub_historial(
  _desde date default (now() at time zone 'America/Bogota')::date,
  _user uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid := public.current_tenant_id();
  v_dia date := coalesce(_desde, (now() at time zone 'America/Bogota')::date);
  v_ini timestamptz;
  v_fin timestamptz;
  v_todo boolean;
  v_solo uuid;
  v_eventos jsonb;
  v_resumen jsonb;
begin
  if v_uid is null or not coalesce(public.ve_argos(), false) then
    raise exception 'hub_historial: sin permiso' using errcode = '42501';
  end if;
  v_todo := coalesce(public.es_admin_o_dueno(v_uid), false) or coalesce(public.es_rh(v_uid), false);
  v_solo := case when v_todo then _user else v_uid end;
  v_ini := v_dia::timestamp at time zone 'America/Bogota';
  v_fin := (v_dia + 1)::timestamp at time zone 'America/Bogota';

  with gente as (
    select p.id, p.full_name
      from public.profiles p
      join public.tenant_members m on m.user_id = p.id and m.tenant_id = v_tenant
     where p.deleted_at is null
       and (v_solo is null or p.id = v_solo)
       and (p.nivel in ('supervisor', 'manager')
            or exists (select 1 from public.hub_eventos e where e.user_id = p.id and e.creado >= v_ini and e.creado < v_fin))
  ),
  ev as (
    select e.* from public.hub_eventos e
      join gente g on g.id = e.user_id
     where e.creado >= v_ini and e.creado < v_fin
  ),
  al as (
    select a.user_id, a.problema,
           greatest(0, extract(epoch from (least(coalesce(a.hasta, now()), v_fin, now()) - greatest(a.desde, v_ini))))::numeric as seg
      from public.hub_alertas a
      join gente g on g.id = a.user_id
     where a.desde < v_fin and coalesce(a.hasta, now()) > v_ini
  )
  select
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', ev.id, 'user_id', ev.user_id, 'nombre', g.full_name, 'tipo', ev.tipo,
        'valor', ev.valor, 'causa', ev.causa, 'creado', ev.creado)
        order by ev.creado desc, ev.id desc)
       from ev join gente g on g.id = ev.user_id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', g.id,
        'nombre', g.full_name,
        'movimientos', (select count(*) from ev where ev.user_id = g.id),
        'pantalla_quitada', (select count(*) from ev where ev.user_id = g.id and ev.tipo = 'pantalla' and ev.causa = 'apagada'),
        'pantalla_falla', (select count(*) from ev where ev.user_id = g.id and ev.tipo = 'pantalla' and ev.causa in ('negra', 'permiso', 'falla')),
        'camara_apagada', (select count(*) from ev where ev.user_id = g.id and ev.tipo = 'camara' and ev.valor = 'apagada'),
        'salidas', (select count(*) from ev where ev.user_id = g.id and ev.tipo = 'hub' and ev.valor = 'salio'),
        'salidas_propias', (select count(*) from ev where ev.user_id = g.id and ev.tipo = 'hub' and ev.valor = 'salio' and ev.causa = 'salio'),
        'salidas_falla', (select count(*) from ev where ev.user_id = g.id and ev.tipo = 'hub' and ev.valor = 'salio' and ev.causa in ('app_caida', 'conexion')),
        'min_sin_pantalla', round(coalesce((select sum(al.seg) from al where al.user_id = g.id and al.problema = 'pantalla'), 0) / 60),
        'min_sin_camara', round(coalesce((select sum(al.seg) from al where al.user_id = g.id and al.problema = 'camara'), 0) / 60),
        'min_fuera', round(coalesce((select sum(al.seg) from al where al.user_id = g.id and al.problema = 'fuera'), 0) / 60))
        order by g.full_name)
       from gente g), '[]'::jsonb)
    into v_eventos, v_resumen;

  return jsonb_build_object('dia', v_dia, 'eventos', v_eventos, 'resumen', v_resumen);
end;
$$;
revoke all on function public.hub_historial(date, uuid) from public, anon;
grant execute on function public.hub_historial(date, uuid) to authenticated;
