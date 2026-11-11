-- COSTOS Y CONEXIONES, SOLO EL DUEÑO (Alvaro, 11/11/2026).
--
-- "Poneme bien el pricing, cuánto estoy pagando, cuánto gasta esta
-- plataforma" + "una parte para saber que todo está conectado". Decidió: una
-- página dentro de Maven que solo ve el dueño, con facturas reales + uso en
-- vivo, todo lo que paga (IA, servidores, correos y dominios, otras), y cuatro
-- vistas: total del mes por servicio, lo que viene, dónde ahorrar y alerta si
-- algo se dispara (+20 % de un mes a otro).
--
-- · costos_servicios: un renglón por servicio, con el monto de la FACTURA (o
--   «falta» si hace falta que el dueño inicie sesión para verla). Lo actualiza
--   Claude con lo que lee en cada panel; la página solo lee.
-- · costos_mensuales: la foto de cada mes (la toma un cron cada día); al subir
--   más de 20 % contra el mes anterior, campana a los dueños (una vez por mes).
-- · conexiones_estado(): las señales que viven en la base (crons, correo del
--   equipo, Backstage, llamadas, subidas, incidentes). Las pruebas en vivo
--   contra cada proveedor las hace la edge conexiones-ping.

create table if not exists public.costos_servicios (
  id text primary key,
  nombre text not null,
  categoria text not null check (categoria in ('ia', 'servidores', 'correos', 'otras')),
  proveedor text not null,
  es_maven boolean not null default true,   -- false: va en tus facturas pero no es Maven
  monto_usd numeric(10, 2),                 -- null = falta el dato
  ciclo text not null check (ciclo in ('mensual', 'anual')),
  fuente text not null check (fuente in ('factura', 'estimado', 'falta')),
  detalle text,
  proximo_cobro date,
  proximo_monto_usd numeric(10, 2),         -- el mensual que viene, con aumentos ya anunciados
  proximo_detalle text,
  ahorro_usd numeric(10, 2),                -- cuánto baja al mes si se hace lo de ahorro_detalle
  ahorro_detalle text,
  orden integer not null default 100,
  activo boolean not null default true,
  revisado_at timestamptz not null default now()
);

create table if not exists public.costos_mensuales (
  mes date not null,
  servicio_id text not null references public.costos_servicios (id) on delete cascade,
  monto_usd numeric(10, 2) not null,
  avisado boolean not null default false,
  primary key (mes, servicio_id)
);

alter table public.costos_servicios enable row level security;
alter table public.costos_mensuales enable row level security;

create policy costos_servicios_solo_dueno on public.costos_servicios
  for select to authenticated using (public.es_dueno((select auth.uid())));
create policy costos_mensuales_solo_dueno on public.costos_mensuales
  for select to authenticated using (public.es_dueno((select auth.uid())));

-- Lo que vale al mes: lo anual se reparte en 12.
create or replace function public.costo_mensual(_monto numeric, _ciclo text)
returns numeric language sql immutable as $$
  select case when _monto is null then null when _ciclo = 'anual' then round(_monto / 12, 2) else _monto end;
$$;

-- La foto del mes (cada día, para que el mes en curso tenga el último dato).
create or replace function public.costos_foto_del_mes()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.costos_mensuales (mes, servicio_id, monto_usd)
  select date_trunc('month', now() at time zone 'America/Bogota')::date, s.id, public.costo_mensual(s.monto_usd, s.ciclo)
    from public.costos_servicios s
   where s.activo and s.monto_usd is not null
  on conflict (mes, servicio_id) do update set monto_usd = excluded.monto_usd
   where public.costos_mensuales.monto_usd is distinct from excluded.monto_usd;
  get diagnostics n = row_count;
  return n;
end $$;

-- Si un servicio sube más de 20 % contra el mes anterior: campana a los dueños,
-- una sola vez en el mes.
create or replace function public.costos_avisar_si_se_dispara()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_antes numeric;
  v_nombre text;
begin
  if new.avisado then return new; end if;
  select m.monto_usd into v_antes from public.costos_mensuales m
   where m.servicio_id = new.servicio_id and m.mes = (new.mes - interval '1 month')::date;
  if v_antes is null or v_antes < 1 or new.monto_usd <= v_antes * 1.2 then return new; end if;

  select nombre into v_nombre from public.costos_servicios where id = new.servicio_id;
  insert into public.notifications
    (user_id, type, title, message, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
  select o.user_id, 'costo_disparado',
         format('%s subió %s %%', coalesce(v_nombre, new.servicio_id), round((new.monto_usd / v_antes - 1) * 100)),
         format('Pasó de USD %s a USD %s al mes. Mira el detalle en Costos y conexiones.', v_antes, new.monto_usd),
         'costos', 'Oficina', 'high', 'new', 'personal', '/oficina/costos'
    from (select distinct user_id from public.tenant_owners) o;
  new.avisado := true;
  return new;
end $$;

create trigger costos_mensuales_se_dispara
  before insert or update of monto_usd on public.costos_mensuales
  for each row execute function public.costos_avisar_si_se_dispara();

-- Las señales de conexión que viven en la base. Solo el dueño.
create or replace function public.conexiones_estado()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.es_dueno((select auth.uid())) then
    raise exception 'solo el dueño' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'crons', (
      with ultima as (
        select distinct on (d.jobid) d.jobid, d.status, d.start_time, left(d.return_message, 200) as mensaje
          from cron.job_run_details d
         where d.start_time > now() - interval '26 hours'
         order by d.jobid, d.start_time desc
      )
      select jsonb_build_object(
        'activos', (select count(*) from cron.job where active),
        'fallando', coalesce((
          select jsonb_agg(jsonb_build_object('job', j.jobname, 'mensaje', u.mensaje,
                   'hace_min', round(extract(epoch from now() - u.start_time) / 60)) order by j.jobname)
            from cron.job j join ultima u on u.jobid = j.jobid
           where j.active and u.status = 'failed'), '[]'::jsonb),
        'apagados', coalesce((select jsonb_agg(jobname order by jobname) from cron.job where not active), '[]'::jsonb)
      )),
    'correo_equipo', (
      select jsonb_build_object(
        'conectadas', count(*),
        'con_error', count(*) filter (where last_error is not null),
        'sin_sincronizar', count(*) filter (where last_sync_at is null or last_sync_at < now() - interval '30 minutes'))
        from public.mail_credentials where revoked_at is null),
    'backstage', jsonb_build_object(
      'llaves', (select count(*) from public.api_keys where 'equipo:write' = any(scopes)),
      'ultimo_envio', (select max(created_at) from public.integracion_equipo_syncs)),
    'llamadas', jsonb_build_object(
      'cortes_1h', (select count(*) from public.llamada_cortes where creado > now() - interval '1 hour' and fase not in ('reentrada_ok')),
      'midiendo_1h', (select count(distinct user_id) from public.llamada_salud where creado > now() - interval '1 hour')),
    'subidas', (
      select jsonb_build_object(
        'ok_24h', count(*) filter (where estado = 'ok'),
        'fallo_24h', count(*) filter (where estado = 'fallo'),
        'trabadas', count(*) filter (where estado in ('subiendo', 'pausado') and actualizado_at < now() - interval '15 minutes'))
        from public.drive_aportar_intentos where iniciado_at > now() - interval '24 hours'),
    'nas', (select to_jsonb(s) - 'id' from public.drive_nas_salud s where s.id = 1),
    'incidentes', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', tipo, 'mensaje', mensaje, 'desde', abierto_at) order by abierto_at)
        from public.salud_incidentes where cerrado_at is null), '[]'::jsonb),
    'hubstaff', (select jsonb_build_object('activo', sync_enabled, 'ultimo', last_sync_at) from public.hubstaff_config limit 1)
  ) into v;
  return v;
end $$;

revoke all on function public.conexiones_estado() from public, anon;
grant execute on function public.conexiones_estado() to authenticated;
revoke all on function public.costos_foto_del_mes() from public, anon, authenticated;

-- Lo que hay hoy, leído de las facturas el 11/11/2026 (Google AI Studio,
-- Supabase, Resend, ElevenLabs, GitHub, GoDaddy). Contabo y el Zoho de
-- maven-ai.me piden que el dueño inicie sesión: quedan como «falta».
insert into public.costos_servicios
  (id, nombre, categoria, proveedor, es_maven, monto_usd, ciclo, fuente, detalle, proximo_cobro, proximo_monto_usd, proximo_detalle, ahorro_usd, ahorro_detalle, orden)
values
  ('google_ia', 'IA de Google (Argos y cámara)', 'ia', 'Google AI Studio', true, 48.00, 'mensual', 'factura',
   'USD 17,44 cobrados del 1 al 11 de noviembre (panel de Google). Al ritmo de hoy, unos USD 48 al mes.',
   '2027-01-01', 95.00, 'El 1 de enero Google duplica el precio del modelo que usa Argos (Flash). La cámara usa Flash-Lite, que no sube.',
   70.00, 'Pasar Argos a Flash-Lite: primero se prueba al lado del actual y se te muestra si juzga igual.', 10),
  ('elevenlabs', 'Voz de los avisos (ElevenLabs)', 'ia', 'ElevenLabs', true, 22.00, 'mensual', 'factura',
   'Plan Creator. Este mes se usaron 138 de 302.761 créditos.', '2026-12-07', null, null,
   16.00, 'Bajar al plan Starter (USD 6): sobra para lo que se usa.', 20),
  ('supabase_maven', 'Base de datos de Maven (Supabase)', 'servidores', 'Supabase', true, 148.00, 'mensual', 'factura',
   'Servidor grande ~USD 110 al mes, plan Pro USD 25, dominio propio USD 9,45, tráfico y funciones ~USD 13, menos USD 10 de crédito. Ciclo 14 oct–14 nov.',
   '2026-11-14', null, null, null, null, 30),
  ('contabo_principal', 'Servidor principal (Contabo)', 'servidores', 'Contabo', true, null, 'mensual', 'falta',
   'Donde viven la app, el NAS y los servicios. Esa cuenta de Contabo no está a tu nombre: falta el acceso.', null, null, null, null, null, 40),
  ('contabo_llamadas', 'Servidor de llamadas (Contabo)', 'servidores', 'Contabo', true, 27.00, 'mensual', 'estimado',
   'Cloud VPS 8 de LiveKit. Precio de lista; falta ver la factura (inicia sesión en Contabo).', null, null, null, null, null, 50),
  ('resend', 'Envío de correos (Resend Pro)', 'correos', 'Resend', true, 20.00, 'mensual', 'factura',
   'Hasta 50.000 correos al mes. Pagado desde diciembre de 2025; Maven lo usa desde el 11/11.', '2026-12-08', null, null, null, null, 60),
  ('zoho', 'Correos del equipo (Zoho, @maven-ai.me)', 'correos', 'Zoho', true, null, 'mensual', 'falta',
   '59 casillas. Falta iniciar sesión en el Zoho de maven-ai.me (el que estaba abierto era el de Zentrix).', null, null, null, null, null, 70),
  ('godaddy_maven', 'Dominio maven-ai.me (GoDaddy)', 'correos', 'GoDaddy', true, 29.99, 'anual', 'factura',
   'Renovación automática prendida.', '2026-12-19', null, null, null, null, 80),
  ('github', 'Código y pruebas (GitHub)', 'otras', 'GitHub', true, 0.00, 'mensual', 'factura',
   'Plan gratis: las pruebas automáticas usan USD 3,40 de USD 12 incluidos.', null, null, null, null, null, 90),
  ('supabase_otros', 'Supabase: otros 20 proyectos', 'otras', 'Supabase', false, 185.00, 'mensual', 'factura',
   'Van en la misma factura de Supabase (USD 9,27 cada uno) pero no son Maven: One Pharmacy, BIORA, Piclink, Unlok, KASH, BLU y otros.',
   '2026-11-14', null, null,
   18.54, 'Apagar «BLU Marketing Leads» y «BLU Management»: Blu ya no se usa.', 200)
on conflict (id) do nothing;

select public.costos_foto_del_mes();

select cron.schedule('costos-foto-del-mes', '7 6 * * *', $$ select public.costos_foto_del_mes(); $$);
