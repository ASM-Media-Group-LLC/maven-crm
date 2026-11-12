-- COSTOS: LAS CUENTAS ATADAS A CADA SERVICIO (Alvaro, 11/11/2026).
--
-- «No me dijiste cuántas cuentas había atadas para poder bajar costos.» Por
-- cada servicio de la página de costos: qué casillas, proyectos, llaves,
-- servidores y puestos cuelgan de él, cuáles se usan y cuáles no, y cuánto se
-- ahorra si se suelta lo que no se usa.
--
-- · costos_cuentas: un renglón por cosa atada (o por grupo, con `cantidad`,
--   cuando son muchas iguales: «52 casillas de gente activa»). Solo el dueño la
--   lee (RLS con es_dueno, como costos_servicios y costos_cobros).
-- · estado: en_uso | sin_uso | de_alguien_que_salio | no_se_puede_ver. Lo que
--   no se puede ver sin que el dueño inicie sesión se dice así, no se inventa.
-- · ahorro_usd_mes: lo que baja al mes si se suelta. null = no se sabe el
--   precio (por ejemplo, la licencia de Zoho: el plan no se ve desde aquí).
-- · revisado: dónde y cuándo se revisó cada renglón.
--
-- Lo que hay hoy (11/11/2026):
--   · Zoho: se calcula AL APLICAR esta migración con lo que Maven sabe de cada
--     casilla (casillas conectadas, papelera e ingresos), sin escribir correos
--     de nadie en el repositorio. Zoho por dentro (licencias de hoy, casillas
--     que no son de Maven) solo lo ve la acción «Ver en vivo» de la página
--     (edge conexiones-ping, accion zoho_casillas) o el dueño en Zoho.
--   · Supabase: los 22 proyectos de la organización ASM TECH, con su tamaño y
--     las visitas de las últimas 24 h (y del 05/11 en los que estaban parados).
--   · Llaves: la de Google (Gemini) de Maven y las 8 de ElevenLabs (informe del
--     11/11: Lumina 56,6 %, LetShoot 39,9 %, Maven 3,5 %; 4 llaves sin uso en
--     90 días). OpenRouter y Anthropic están muertas y no cobran: no van.
--   · Servidores: el principal (147.93.3.97, la cuenta de Contabo no es del
--     dueño) y el de llamadas (195.26.254.111), con lo que corre en cada uno
--     según el repositorio y las señales de la base.

create table if not exists public.costos_cuentas (
  id uuid primary key default gen_random_uuid(),
  servicio_id text not null references public.costos_servicios (id) on delete cascade,
  tipo text not null check (tipo in ('buzon', 'proyecto', 'llave', 'servidor', 'puesto')),
  nombre text not null,
  detalle text,
  estado text not null check (estado in ('en_uso', 'sin_uso', 'de_alguien_que_salio', 'no_se_puede_ver')),
  cantidad integer not null default 1 check (cantidad > 0),
  ahorro_usd_mes numeric(10, 2),
  fuente text not null default 'verificado' check (fuente in ('verificado', 'estimado', 'falta')),
  revisado text,
  orden integer not null default 100
);
create index if not exists costos_cuentas_servicio on public.costos_cuentas (servicio_id, orden);

alter table public.costos_cuentas enable row level security;
create policy costos_cuentas_solo_dueno on public.costos_cuentas
  for select to authenticated using (public.es_dueno((select auth.uid())));

-- Lo que Maven sabe de cada casilla, para cruzarlo EN VIVO con Zoho (edge
-- conexiones-ping, accion zoho_casillas, que ya exige al dueño). Solo
-- service_role: devuelve correos, nunca credenciales. «viva» = la cuenta no
-- está en la papelera ni purgada; una dirección vieja de una cuenta viva (se le
-- cambió el correo) vuelve sin fecha, para que se vea como «sin uso».
create or replace function public.costos_casillas_de_maven()
returns table (email text, viva boolean, ultima timestamptz)
language sql stable security definer set search_path = public, auth as $$
  with casillas as (
    select distinct on (lower(m.email_address))
           lower(m.email_address) as email, m.user_id, m.revoked_at, m.last_used_at
      from public.mail_credentials m
     order by lower(m.email_address), m.created_at desc
  )
  select c.email,
         (p.id is not null and p.deleted_at is null) as viva,
         case when c.revoked_at is not null then null
              else greatest(au.last_sign_in_at,
                            (select max(coalesce(s.refreshed_at, s.updated_at)) from auth.sessions s where s.user_id = c.user_id),
                            c.last_used_at)
         end as ultima
    from casillas c
    left join public.profiles p on p.id = c.user_id
    left join auth.users au on au.id = c.user_id;
$$;
revoke all on function public.costos_casillas_de_maven() from public, anon, authenticated;
grant execute on function public.costos_casillas_de_maven() to service_role;

-- ── Correo del equipo (Zoho) ────────────────────────────────────────────────
-- Una fila por casilla que Maven conoce. «Activa» = entró a Maven (inicio de
-- sesión, sesión renovada o correo usado desde Maven) en las últimas 3 semanas.
create temporary table _casillas as
with casillas as (
  select distinct on (lower(m.email_address))
         lower(m.email_address) as email, m.user_id, m.revoked_at, m.last_used_at
    from public.mail_credentials m
   order by lower(m.email_address), m.created_at desc
)
select c.email, c.revoked_at, p.deleted_at,
       greatest(au.last_sign_in_at,
                (select max(coalesce(s.refreshed_at, s.updated_at)) from auth.sessions s where s.user_id = p.id),
                c.last_used_at) as ultima
  from casillas c
  join public.profiles p on p.id = c.user_id
  left join auth.users au on au.id = p.id;

create temporary table _hoy as
select to_char(now() at time zone 'America/Bogota', 'DD/MM/YYYY') as fecha;

-- Gente activa: un solo renglón con la cantidad.
insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, cantidad, fuente, revisado, orden)
select 'zoho', 'buzon',
       format('%s casillas de gente activa', count(*)),
       'Entraron a Maven en las últimas 3 semanas. Cada una ocupa una licencia de Zoho.',
       'en_uso', count(*), 'verificado',
       format('Revisado en Maven el %s: casillas conectadas e ingresos.', (select fecha from _hoy)),
       90
  from _casillas
 where deleted_at is null and revoked_at is null and ultima >= now() - interval '21 days'
having count(*) > 0;

-- Sin uso: cuentas vivas que no entran a Maven hace más de 3 semanas (o nunca).
insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, fuente, revisado, orden)
select 'zoho', 'buzon', email,
       case when ultima is null then 'Nunca entró a Maven con esta cuenta.'
            else format('No entra a Maven desde el %s.', to_char(ultima at time zone 'America/Bogota', 'DD/MM')) end
         || ' Si tampoco la usa en Zoho, se puede liberar su licencia.',
       'sin_uso', 'verificado',
       format('Revisado en Maven el %s. Si la abre directo en Zoho, eso no lo puedo ver.', (select fecha from _hoy)),
       20
  from _casillas
 where deleted_at is null and revoked_at is null and (ultima is null or ultima < now() - interval '21 days');

-- De gente que salió: desde el 05/10 la casilla se guarda 30 días en la papelera
-- y se borra sola al purgar la cuenta. (Las de antes del 05/10 se borraban al
-- dar de baja: por el conteo de Zoho del 26/10 ya no están, y no se listan.)
insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, fuente, revisado, orden)
select 'zoho', 'buzon', email,
       case when deleted_at + interval '30 days' > now()
            then format('En la papelera de Maven desde el %s. La casilla se guarda 30 días por si vuelve y se borra sola el %s.',
                        to_char(deleted_at at time zone 'America/Bogota', 'DD/MM'),
                        to_char((deleted_at + interval '30 days') at time zone 'America/Bogota', 'DD/MM'))
            else format('En la papelera de Maven desde el %s. Su casilla debió borrarse el %s, pero la limpieza diaria estaba fallando (el arreglo entró el 11/11): se borra en la próxima pasada.',
                        to_char(deleted_at at time zone 'America/Bogota', 'DD/MM'),
                        to_char((deleted_at + interval '30 days') at time zone 'America/Bogota', 'DD/MM'))
       end,
       'de_alguien_que_salio', 'verificado',
       format('Revisado en Maven el %s (papelera y bitácora de bajas).', (select fecha from _hoy)),
       10
  from _casillas
 where deleted_at is not null and deleted_at >= '2026-10-05';

-- Las que ya se purgaron de Maven y esperan (o fallaron) el borrado en Zoho.
insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, fuente, revisado, orden)
select 'zoho', 'buzon', lower(b.direccion),
       case when b.estado = 'fallido'
            then format('La cuenta ya se borró de Maven, pero Zoho no dejó borrar la casilla (%s). Bórrala tú en Zoho.', coalesce(b.motivo, 'sin motivo'))
            else 'La cuenta ya se borró de Maven; la casilla está en cola para borrarse de Zoho.' end,
       'de_alguien_que_salio', 'verificado',
       format('Revisado en la cola de borrado de Maven el %s.', (select fecha from _hoy)),
       10
  from public.buzones_por_borrar b
 where b.estado in ('pendiente', 'fallido')
   and not exists (select 1 from public.costos_cuentas c where c.servicio_id = 'zoho' and c.nombre = lower(b.direccion));

insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, fuente, revisado, orden) values
  ('zoho', 'puesto', 'Licencias pagadas en Zoho',
   'Zoho dijo 70 compradas y 63 en uso el 06/10, y tenía 67 casillas el 26/10. Hoy no lo puedo ver: toca «Ver en vivo» o entra tú a Zoho. Al liberar casillas hay que bajar también las licencias para que baje la factura.',
   'no_se_puede_ver', 'falta',
   'No lo puedo ver: necesito que entres tú a Zoho (mailadmin.zoho.com › Suscripción).', 50),
  ('zoho', 'buzon', '1 casilla en Zoho sin cuenta en Maven',
   'El 26/10 Zoho tenía 67 casillas y Maven conocía 66 (59 de gente activa y 7 de la papelera). La que sobra seguramente es la del administrador de Zoho (corp@unlok.me), que no se toca.',
   'no_se_puede_ver', 'estimado',
   'Sacado del conteo de Zoho del 26/10 contra las casillas de Maven. Para confirmarlo, «Ver en vivo».', 60);

-- ── Supabase: los 22 proyectos de la organización ASM TECH ─────────────────
-- Todos activos. Maven es el único grande (Large); los otros 21 son Micro:
-- USD 0,01344 por hora ≈ USD 9,81 al mes cada uno (precio de lista; el plan Pro
-- trae USD 10 de crédito que ya cubre uno). Pausar uno parado ahorra eso.
insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, ahorro_usd_mes, fuente, revisado, orden) values
  ('supabase_maven', 'proyecto', 'MAVEN app v2.0',
   'El de Maven. Servidor grande (Large, USD 0,1517 por hora) · us-east-1 · creado el 09/12/2025 · 2,3 millones de visitas en 24 h.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (lista de proyectos y registros de 24 h).', 10),

  ('supabase_otros', 'proyecto', 'BIORA app v2.0',
   'Micro · us-east-1 · creado el 09/04/2026 · 0 visitas en 24 h y 0 el 05/11 · último inicio de sesión el 27/10. Hay otro proyecto de Biora (Biora_rork).',
   'sin_uso', 9.81, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y del 05/11, y usuarios).', 10),
  ('supabase_otros', 'proyecto', 'Biora_rork',
   'Micro · us-east-1 · creado el 02/04/2026 · 0 visitas en 24 h y 0 el 05/11 · último inicio de sesión el 04/11.',
   'sin_uso', 9.81, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y del 05/11, y usuarios).', 11),
  ('supabase_otros', 'proyecto', 'BLU Marketing Leads',
   'Micro · us-east-1 · creado el 16/09/2026 · 2 visitas en 24 h y 4 el 05/11 · sin usuarios. Blu se cortó el 11/11.',
   'sin_uso', 9.81, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y del 05/11, y usuarios).', 12),
  ('supabase_otros', 'proyecto', 'chatters-ops',
   'Micro · us-west-2 · creado el 20/08/2026 · 0 visitas en 24 h y 0 el 05/11 · último inicio de sesión el 21/08.',
   'sin_uso', 9.81, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y del 05/11, y usuarios).', 13),
  ('supabase_otros', 'proyecto', 'makeme new',
   'Micro · us-east-1 · creado el 17/06/2026 · 13 visitas en 24 h y 0 el 05/11 · último inicio de sesión el 27/07.',
   'sin_uso', 9.81, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y del 05/11, y usuarios).', 14),
  ('supabase_otros', 'proyecto', 'PHC Pharmacy Analytics v2',
   'Micro · us-east-1 · creado el 28/09/2026 · 0 visitas en 24 h y 0 el 05/11 · sin usuarios.',
   'sin_uso', 9.81, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y del 05/11, y usuarios).', 15),
  ('supabase_otros', 'proyecto', 'Piclink App V1.0',
   'Micro · us-east-1 · creado el 06/02/2026 · 73 visitas al día, todas de un proceso automático; nadie inicia sesión desde el 07/05. La versión nueva (piclink) es la que se usa.',
   'sin_uso', 9.81, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y del 05/11, y usuarios).', 16),
  ('supabase_otros', 'proyecto', 'roleplay-ks',
   'Micro · us-west-2 · creado el 23/08/2026 · 0 visitas a la web en 24 h y 0 el 05/11 · sin usuarios.',
   'sin_uso', 9.81, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y del 05/11, y usuarios).', 17),

  ('supabase_otros', 'proyecto', 'KASH Leads',
   'Micro · us-east-1 · creado el 25/06/2026 · 533.788 visitas en 24 h · inicio de sesión hoy.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 30),
  ('supabase_otros', 'proyecto', 'letshoot',
   'Micro · us-east-1 · creado el 13/07/2026 · 56.437 visitas en 24 h · inicio de sesión hoy.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 31),
  ('supabase_otros', 'proyecto', 'piclink',
   'Micro · us-east-2 · creado el 04/05/2026 · 32.839 visitas en 24 h · inicio de sesión hoy.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 32),
  ('supabase_otros', 'proyecto', 'Unlimited Sales 0.1',
   'Micro · us-east-1 · creado el 22/05/2026 · 6.062 visitas en 24 h · último inicio de sesión el 03/11.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 33),
  ('supabase_otros', 'proyecto', 'One Pharmacy Solutions — staging',
   'Micro · us-east-1 · creado el 01/10/2026 · 5.785 visitas en 24 h · inicio de sesión hoy. Es el de pruebas de One Pharmacy.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 34),
  ('supabase_otros', 'proyecto', 'Leak Hunter app v1.0',
   'Micro · us-east-1 · creado el 06/02/2026 · 5.636 visitas en 24 h · inicio de sesión hoy.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 35),
  ('supabase_otros', 'proyecto', 'One Pharmacy Dahsboards and KPIs',
   'Micro · us-east-1 · creado el 24/09/2026 · 3.397 visitas en 24 h · último inicio de sesión el 02/11.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 36),
  ('supabase_otros', 'proyecto', 'trafix',
   'Micro · us-east-1 · creado el 25/10/2026 · 2.721 visitas en 24 h · último inicio de sesión el 04/11.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 37),
  ('supabase_otros', 'proyecto', 'Finance',
   'Micro · us-east-1 · creado el 21/09/2026 · 1.841 visitas en 24 h · sin usuarios (lo usa un proceso).',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 38),
  ('supabase_otros', 'proyecto', 'OnePharmacy eCommerce v2',
   'Micro · us-east-1 · creado el 21/04/2026 · 962 visitas en 24 h · último inicio de sesión el 28/10.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 39),
  ('supabase_otros', 'proyecto', 'BLU Management',
   'Micro · us-east-1 · creado el 17/10/2026 · 718 visitas en 24 h · 7 usuarios, uno entró hoy. Todavía se usa aunque Blu se cortó.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 40),
  ('supabase_otros', 'proyecto', 'lumina',
   'Micro · us-east-1 · creado el 05/09/2026 · 313 visitas en 24 h · último inicio de sesión el 09/11.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 41),
  ('supabase_otros', 'proyecto', 'Unlok Accounting',
   'Micro · us-east-1 · creado el 13/05/2026 · 80 visitas en 24 h de una sesión abierta · último inicio de sesión el 08/09. Poco uso.',
   'en_uso', null, 'verificado', 'Revisado en Supabase el 11/11/2026 (registros de 24 h y usuarios).', 42);

-- ── IA de Google (Gemini) ───────────────────────────────────────────────────
insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, fuente, revisado, orden) values
  ('google_ia', 'llave', 'GEMINI_API_KEY (la llave de Google de Maven)',
   'Pagada (Tier 1). La usan Argos (572 rondas en 24 h) y la cámara (23.477 revisiones en 24 h; solo le pregunta a Google si ve algo raro). Scouter la usó 1 vez. Otras 6 funciones la tienen pero no la usaron en 24 h: asistente de ventas, Clari, Mike de QA, dos de Scouter y el diagnóstico.',
   'en_uso', 'verificado', 'Revisado en los registros de Maven (24 h) y en Google AI Studio › Spend (11/11/2026).', 10);

-- ── ElevenLabs: el plan y las 8 llaves (informe del 11/11, 90 días) ─────────
insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, ahorro_usd_mes, fuente, revisado, orden) values
  ('elevenlabs', 'puesto', 'Plan Creator: 121.000 créditos al mes',
   'Se usan unos 22.000 al mes (65.700 en 90 días) y hay 302.761 guardados. Lumina y LetShoot son el 96 %; Maven, el 3,5 %. Si ellos no lo necesitan, Starter (≈ USD 7 con impuestos, 30.000 créditos) alcanza. Antes de bajar, conviene usar los créditos guardados.',
   'en_uso', 19.36, 'verificado', 'Revisado en ElevenLabs › Suscripción y Developers › Analytics (11/11/2026).', 10),
  ('elevenlabs', 'llave', 'Vigilant Andean Condor (Maven)',
   'Solo la voz de Javi en los avisos y en Argos: 2.300 créditos en 90 días (3,5 %).',
   'en_uso', null, 'verificado', 'Revisado en ElevenLabs › Developers › Analytics (90 días) y en el código de Maven (11/11/2026).', 20),
  ('elevenlabs', 'llave', 'Implacable African Lion (LetShoot v2)',
   '24.500 créditos en 90 días: busca voces en la biblioteca de ElevenLabs y las agrega.',
   'en_uso', null, 'verificado', 'Revisado en ElevenLabs › Developers › Analytics (90 días) y en el código de LetShoot (11/11/2026).', 21),
  ('elevenlabs', 'llave', 'LetShoot (versión anterior)',
   '1.740 créditos en 90 días.',
   'en_uso', null, 'verificado', 'Revisado en ElevenLabs › Developers › Analytics (90 días) (11/11/2026).', 22),
  ('elevenlabs', 'llave', 'Lumina',
   '223 créditos en 90 días con la llave. Lumina gasta casi todo desde la página de ElevenLabs, sin llave: ≈ 36.960 créditos (cursos, música y voces).',
   'en_uso', null, 'verificado', 'Revisado en ElevenLabs › Developers › Analytics (90 días) (11/11/2026).', 23),
  ('elevenlabs', 'llave', 'Unlimited',
   '0 créditos en 90 días. Tenerla no cuesta, pero una llave que nadie usa es mejor borrarla.',
   'sin_uso', null, 'verificado', 'Revisado en ElevenLabs › Developers › Analytics (90 días) (11/11/2026).', 30),
  ('elevenlabs', 'llave', 'Unlimited Reels',
   '0 créditos en 90 días. Tenerla no cuesta, pero una llave que nadie usa es mejor borrarla.',
   'sin_uso', null, 'verificado', 'Revisado en ElevenLabs › Developers › Analytics (90 días) (11/11/2026).', 31),
  ('elevenlabs', 'llave', 'Lumina Video',
   '0 créditos en 90 días. Tenerla no cuesta, pero una llave que nadie usa es mejor borrarla.',
   'sin_uso', null, 'verificado', 'Revisado en ElevenLabs › Developers › Analytics (90 días) (11/11/2026).', 32),
  ('elevenlabs', 'llave', 'Dread Giant Squid',
   '0 créditos en 90 días. Tenerla no cuesta, pero una llave que nadie usa es mejor borrarla.',
   'sin_uso', null, 'verificado', 'Revisado en ElevenLabs › Developers › Analytics (90 días) (11/11/2026).', 33);

-- ── Servidores ──────────────────────────────────────────────────────────────
-- El principal: lo que corre se sabe por el repositorio (infra/, servicios/) y
-- por las señales de la base; el plan, la factura y Dokploy por dentro no.
insert into public.costos_cuentas (servicio_id, tipo, nombre, detalle, estado, cantidad, fuente, revisado, orden) values
  ('contabo_principal', 'servidor', 'Servidor principal (147.93.3.97)',
   'Corre la app de Maven, Dokploy (el panel que despliega) y los servicios de abajo; también sitios que no son de Maven (por ejemplo my.piclink.me). El plan y la factura no los puedo ver.',
   'en_uso', 1, 'falta',
   'No lo puedo ver: esa cuenta de Contabo no está a tu nombre. Necesito que entres tú.', 5),
  ('contabo_principal', 'servidor', 'Blu (blu-bridge)',
   'Blu se cortó: sus sesiones vencieron el 22/10 y el 11/11 decidiste no seguir con Blu. Si el servicio sigue prendido, apágalo en Dokploy.',
   'sin_uso', 1, 'verificado', 'Revisado el 11/11/2026 (Blu cortado). Si sigue prendido solo se ve en Dokploy.', 10),
  ('contabo_principal', 'servidor', 'LiveKit viejo (respaldo)',
   'Las llamadas pasaron al servidor nuevo el 17/10; este quedó de respaldo, sin llamadas. Si sigue prendido, apagarlo le quita peso al servidor.',
   'sin_uso', 1, 'verificado', 'Revisado: Maven llama al servidor nuevo (lk.asmtech.ai). Si sigue prendido solo se ve en Dokploy.', 11),
  ('contabo_principal', 'servidor', 'Scouter (scouter-worker)',
   'Último trabajo el 10/09: lleva dos meses sin nada que hacer.',
   'sin_uso', 1, 'verificado', 'Revisado en la base de Maven (cola de Scouter, 11/11/2026).', 12),
  ('contabo_principal', 'servidor', 'Correo del equipo (mail-sync)',
   'Trae el correo de las casillas del equipo; la última vez fue hoy.',
   'en_uso', 1, 'verificado', 'Revisado en la base de Maven (última sincronización, 11/11/2026).', 20),
  ('contabo_principal', 'servidor', 'Hubstaff (hubstaff-bridge)',
   'Trajo datos de Hubstaff hoy. Hubstaff se paga aparte y no está en esta página.',
   'en_uso', 1, 'verificado', 'Revisado en la base de Maven (última sincronización, 11/11/2026).', 21),
  ('contabo_principal', 'servidor', 'WhatsApp (Evolution / Baileys)',
   '1.330 entradas de WhatsApp en 24 h.',
   'en_uso', 1, 'verificado', 'Revisado en los registros de Maven (24 h, 11/11/2026).', 22),
  ('contabo_principal', 'servidor', 'Telegram (telegram-gateway)',
   '122 lecturas de canales en 24 h (Promolog).',
   'en_uso', 1, 'verificado', 'Revisado en los registros de Maven (24 h, 11/11/2026).', 23),
  ('contabo_principal', 'servidor', 'Otros 4 servicios del código',
   'docs-sync (documentos de la Oficina), web-reader, cloudphone-gateway y whisper. Están en el código; si corren y cuánto usan solo se ve en Dokploy.',
   'no_se_puede_ver', 4, 'falta', 'No lo puedo ver: necesito que entres tú a Dokploy.', 30),

  ('contabo_llamadas', 'servidor', 'Servidor de llamadas (195.26.254.111)',
   'Cloud VPS 8 (8 núcleos, 24 GB). Solo corre las llamadas (LiveKit), su certificado y un guardián que lo revive. En 24 h: 3.821 avisos de llamadas y 67.268 pedidos de Cowork.',
   'en_uso', 1, 'verificado',
   'Revisado con lo que Maven ve de las llamadas (11/11/2026). Adentro del servidor no entré hoy.', 10);

-- ── Lo que dice cada servicio de cómo bajar (la página lo muestra arriba) ──
update public.costos_servicios set
  nombre = 'Supabase: otros 21 proyectos',
  detalle = 'Van en la misma factura de Supabase pero no son Maven. Hoy son 21 (el 25/10 se creó «trafix»); la última factura cobró USD 185 por 20, unos USD 9,27 cada uno.',
  ahorro_usd = 78.48,
  ahorro_detalle = 'Pausa los 8 proyectos que nadie usa (ninguno es Maven): cada uno cuesta ≈ USD 9,81 al mes.'
  where id = 'supabase_otros';
update public.costos_servicios set
  ahorro_detalle = 'Lumina y LetShoot son el 96 % del uso; Maven solo necesita el plan Starter. Si ellos no lo necesitan, bajar ahorra ≈ USD 19 al mes.'
  where id = 'elevenlabs';
update public.costos_servicios set
  ahorro_detalle = 'Libera las casillas de gente que ya salió y las que nadie usa, y baja las licencias en Zoho. El precio por licencia no lo puedo ver.'
  where id = 'zoho';
update public.costos_servicios set
  ahorro_detalle = 'Apaga lo que ya no se usa (Blu, el LiveKit viejo y Scouter). No baja la factura, pero le quita peso al servidor que se cae.'
  where id = 'contabo_principal';

drop table _casillas, _hoy;
