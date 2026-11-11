-- COSTOS: CADA COBRO DE 2026 Y LA PROYECCIÓN (Alvaro, 11/11/2026).
--
-- "Cuánto voy gastando este mes, cuánto es el del año, cuánto me va a costar
-- la proyección". Decidió: el año es 2026 de enero a hoy; de Supabase cuenta
-- solo la parte de Maven (los otros 20 proyectos van aparte).
--
-- · costos_cobros: cada cobro real (factura) o, cuando el proveedor no da el
--   detalle, la parte de Maven estimada de la factura (estimado). De aquí salen
--   «este mes» y «este año».
-- · costos_servicios.dia_cobro: el día del mes en que cobra cada servicio; con
--   eso la página proyecta lo que falta del mes, el cierre del año y los
--   próximos 12 meses. ciclo «uso» = se cobra por consumo (Google).
-- · Claude (plan Ultra) entra a la cuenta: Alvaro lo pidió (11/11).

alter table public.costos_servicios add column if not exists dia_cobro smallint check (dia_cobro between 1 and 31);
alter table public.costos_servicios drop constraint if exists costos_servicios_ciclo_check;
alter table public.costos_servicios add constraint costos_servicios_ciclo_check check (ciclo in ('mensual', 'anual', 'uso'));

create table if not exists public.costos_cobros (
  id uuid primary key default gen_random_uuid(),
  servicio_id text not null references public.costos_servicios (id) on delete cascade,
  fecha date not null,
  monto_usd numeric(10, 2) not null,
  fuente text not null check (fuente in ('factura', 'estimado')),
  nota text
);
create index if not exists costos_cobros_fecha on public.costos_cobros (fecha);

alter table public.costos_cobros enable row level security;
create policy costos_cobros_solo_dueno on public.costos_cobros
  for select to authenticated using (public.es_dueno((select auth.uid())));

-- Lo que cada servicio cobra hoy, con su día de cobro (facturas del 11/11).
update public.costos_servicios set ciclo = 'uso', dia_cobro = null where id = 'google_ia';
update public.costos_servicios set monto_usd = 26.62, dia_cobro = 7,
  detalle = 'Plan Creator: USD 22 + impuestos = USD 26,62 al mes. Este mes se usaron 138 de 302.761 créditos.',
  ahorro_usd = 19.36, ahorro_detalle = 'Bajar al plan Starter (USD 6 + impuestos): sobra para lo que se usa.'
  where id = 'elevenlabs';
update public.costos_servicios set dia_cobro = 14 where id = 'supabase_maven';
update public.costos_servicios set monto_usd = 26.85, fuente = 'factura', dia_cobro = 15,
  detalle = 'Cloud VPS 8 de LiveKit, comprado el 15/10/2026 (orden 15548026, USD 26,85).'
  where id = 'contabo_llamadas';
update public.costos_servicios set dia_cobro = 8 where id = 'resend';
update public.costos_servicios set dia_cobro = 19 where id = 'godaddy_maven';

insert into public.costos_servicios
  (id, nombre, categoria, proveedor, es_maven, monto_usd, ciclo, fuente, detalle, dia_cobro, orden)
values
  ('claude', 'Claude (plan Ultra)', 'ia', 'Anthropic', true, 200.00, 'mensual', 'factura',
   'Con el que se construye y opera Maven. Plan Ultra desde el 17/03/2026; además, uso extra comprado aparte (USD 270 en agosto, USD 55 en noviembre).',
   17, 5)
on conflict (id) do nothing;

-- Cada cobro de 2026. Factura = lo que dice el panel del proveedor; estimado =
-- la parte de Maven sacada de una factura que trae varias cosas.
insert into public.costos_cobros (servicio_id, fecha, monto_usd, fuente, nota) values
  -- Claude (claude.ai › Facturación)
  ('claude', '2026-02-15', 20.00, 'factura', 'Plan Pro'),
  ('claude', '2026-03-15', 20.00, 'factura', 'Plan Pro'),
  ('claude', '2026-03-17', 181.35, 'factura', 'Cambio a Ultra (prorrateado)'),
  ('claude', '2026-04-17', 200.00, 'factura', 'Plan Ultra'),
  ('claude', '2026-05-17', 200.00, 'factura', 'Plan Ultra'),
  ('claude', '2026-06-17', 200.00, 'factura', 'Plan Ultra'),
  ('claude', '2026-07-17', 200.00, 'factura', 'Plan Ultra'),
  ('claude', '2026-08-03', 90.00, 'factura', 'Uso extra'),
  ('claude', '2026-08-06', 90.00, 'factura', 'Uso extra'),
  ('claude', '2026-08-06', 90.00, 'factura', 'Uso extra'),
  ('claude', '2026-08-17', 200.00, 'factura', 'Plan Ultra'),
  ('claude', '2026-09-17', 200.00, 'factura', 'Plan Ultra'),
  ('claude', '2026-10-17', 200.00, 'factura', 'Plan Ultra'),
  ('claude', '2026-11-06', 25.00, 'factura', 'Uso extra'),
  ('claude', '2026-11-06', 20.00, 'factura', 'Uso extra'),
  ('claude', '2026-11-07', 10.00, 'factura', 'Uso extra'),
  -- Resend Pro (resend.com › Billing)
  ('resend', '2026-01-08', 20.00, 'factura', null),
  ('resend', '2026-02-08', 20.00, 'factura', null),
  ('resend', '2026-03-08', 20.00, 'factura', null),
  ('resend', '2026-04-08', 20.00, 'factura', null),
  ('resend', '2026-05-08', 20.00, 'factura', null),
  ('resend', '2026-06-08', 20.00, 'factura', null),
  ('resend', '2026-07-08', 20.00, 'factura', null),
  ('resend', '2026-08-08', 20.00, 'factura', null),
  ('resend', '2026-09-08', 20.00, 'factura', null),
  ('resend', '2026-10-08', 20.00, 'factura', null),
  ('resend', '2026-11-08', 20.00, 'factura', null),
  -- Google AI Studio (Spend): uso desde que se pasó a Tier 1 a fines de octubre.
  ('google_ia', '2026-10-31', 1.03, 'factura', 'Uso del 15 al 31 de octubre'),
  ('google_ia', '2026-11-11', 17.44, 'factura', 'Uso del 1 al 11 de noviembre'),
  -- ElevenLabs (cobro del 7)
  ('elevenlabs', '2026-11-07', 26.62, 'factura', 'Plan Creator + impuestos'),
  -- Contabo, servidor de llamadas
  ('contabo_llamadas', '2026-10-15', 26.85, 'factura', 'Orden 15548026'),
  -- Supabase: parte de Maven (servidor de Maven + plan Pro + dominio propio) de
  -- la factura de la cuenta ASM TECH. Solo los dos últimos ciclos traen el
  -- detalle por proyecto: el de sep–oct fue servidor pequeño (USD 14,14).
  ('supabase_maven', '2026-06-13', 48.59, 'estimado', 'Parte de Maven de la factura de USD 134,66'),
  ('supabase_maven', '2026-07-13', 48.59, 'estimado', 'Parte de Maven de la factura de USD 307,68'),
  ('supabase_maven', '2026-08-13', 48.59, 'estimado', 'Parte de Maven de la factura de USD 332,51'),
  ('supabase_maven', '2026-09-13', 48.59, 'estimado', 'Parte de Maven de la factura de USD 297,73'),
  ('supabase_maven', '2026-10-13', 48.59, 'estimado', 'Servidor pequeño USD 14,14 + plan Pro USD 25 + dominio USD 9,45 (factura de USD 247,66)'),
  -- El que viene el 14/11 (fecha futura: no cuenta como gastado hasta ese día;
  -- la proyección del mes lo usa en vez del mensual completo).
  ('supabase_maven', '2026-11-14', 122.00, 'estimado', 'Ciclo 14 oct–14 nov: servidor pequeño 233 h + grande ~506 h, plan Pro, dominio y tráfico');

select public.costos_foto_del_mes();
