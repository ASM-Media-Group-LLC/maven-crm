-- COSTOS: LO QUE GASTA MAVEN, NO LO QUE PAGAS AL PROVEEDOR (Alvaro, 11/11/2026).
--
-- «En el caso de Supabase vos le tenés que cargar lo que se gasta Maven, no lo
-- que pagamos en todo Supabase. Igual con todo lo demás… ElevenLabs, ¿cuánto se
-- gasta? No cuánto paga… Resend, ¿cuántos manda en promedio? ¿Cuánto se va a
-- gastar? … decime “no lo puedo ver, déjame entrar” o “ya lo chequeé”».
--
-- Regla: cada servicio vale el CONSUMO de Maven.
--   · Supabase: el servidor de Maven a su precio por hora (0,1517 grande /
--     0,0206 pequeño) + su parte del plan Pro (1 de 22 proyectos = USD 1,14).
--   · Resend: ~45 correos al día (~1.350 al mes) × USD 20 / 50.000 = USD 0,54.
--     Hasta el 11/11 Maven mandaba por otra cuenta gratis: en 2026 no gastó
--     nada de la cuenta Pro.
--   · ElevenLabs: 138 créditos usados × USD 26,62 / 121.000 = USD 0,03.
--   · Google, el servidor de llamadas y el dominio son solo de Maven.
-- revisado: dice si se revisó (y dónde) o si no se puede ver sin que el dueño
-- inicie sesión.

alter table public.costos_servicios add column if not exists como_se_calcula text;
alter table public.costos_servicios add column if not exists revisado text;

update public.costos_servicios set
  monto_usd = 111.88, fuente = 'factura',
  detalle = 'Solo el servidor de Maven (grande, USD 0,1517 por hora = USD 110,74 al mes) y su parte del plan Pro (1 de 22 proyectos: USD 1,14). Los otros 21 proyectos no cuentan.',
  como_se_calcula = 'Servidor de Maven por hora + 1/22 del plan Pro',
  revisado = 'Revisado en Supabase › Uso, filtrado por el proyecto de Maven (11/11/2026)'
  where id = 'supabase_maven';
update public.costos_servicios set
  como_se_calcula = 'Todo lo de esta llave es de Maven (Argos y la cámara)',
  revisado = 'Revisado en Google AI Studio › Spend (11/11/2026)'
  where id = 'google_ia';
update public.costos_servicios set
  monto_usd = 0.54, ciclo = 'uso', dia_cobro = null, fuente = 'factura',
  detalle = 'Maven manda unos 45 correos al día (unos 1.350 al mes) de los 50.000 que trae el plan Pro de USD 20. Hasta el 11/11 mandaba por otra cuenta gratis.',
  como_se_calcula = '1.350 correos × USD 20 / 50.000',
  revisado = 'Revisado en Resend y en los registros de correos de Maven (11/11/2026)'
  where id = 'resend';
update public.costos_servicios set
  monto_usd = 0.03, ciclo = 'uso', dia_cobro = null, fuente = 'factura',
  detalle = 'Maven usó 138 créditos este mes, de los 121.000 del plan Creator (USD 26,62 con impuestos). El plan casi no se usa.',
  como_se_calcula = '138 créditos × USD 26,62 / 121.000',
  revisado = 'Revisado en ElevenLabs › Suscripción (11/11/2026)',
  ahorro_usd = null, ahorro_detalle = null
  where id = 'elevenlabs';
update public.costos_servicios set
  como_se_calcula = 'Servidor solo para las llamadas de Maven',
  revisado = 'Revisado con la orden de compra 15548026 (15/10/2026). La factura de cada mes no la puedo ver: inicia sesión en Contabo.'
  where id = 'contabo_llamadas';
update public.costos_servicios set
  revisado = 'No lo puedo ver: esa cuenta de Contabo no está a tu nombre. Necesito que entres tú.'
  where id = 'contabo_principal';
update public.costos_servicios set
  revisado = 'No lo puedo ver: inicia sesión en el Zoho de maven-ai.me (el abierto era el de Zentrix).'
  where id = 'zoho';
update public.costos_servicios set
  como_se_calcula = 'USD 29,99 al año repartido en 12 meses',
  revisado = 'Revisado en GoDaddy (11/11/2026)'
  where id = 'godaddy_maven';
update public.costos_servicios set
  como_se_calcula = 'Plan gratis',
  revisado = 'Revisado en GitHub › Billing (11/11/2026)'
  where id = 'github';
update public.costos_servicios set
  revisado = 'Revisado en Supabase › Billing (11/11/2026)'
  where id = 'supabase_otros';

-- Los cobros de 2026, como CONSUMO de Maven.
delete from public.costos_cobros where servicio_id = 'resend';
update public.costos_cobros set monto_usd = 0.03, nota = '138 créditos usados por Maven'
  where servicio_id = 'elevenlabs' and fecha = '2026-11-07';
update public.costos_cobros set monto_usd = 15.28, fuente = 'estimado',
  nota = 'Servidor pequeño de Maven + 1/22 del plan (Supabase solo guarda el detalle por proyecto de los 2 últimos ciclos)'
  where servicio_id = 'supabase_maven' and fecha between '2026-06-01' and '2026-09-30';
update public.costos_cobros set monto_usd = 15.28, fuente = 'factura',
  nota = 'Servidor de Maven: pequeño 620 h + micro 102 h = USD 14,14, + 1/22 del plan'
  where servicio_id = 'supabase_maven' and fecha = '2026-10-13';
update public.costos_cobros set monto_usd = 82.70, fuente = 'factura',
  nota = 'Servidor de Maven: pequeño 233 h + grande ~506 h = USD 81,56, + 1/22 del plan'
  where servicio_id = 'supabase_maven' and fecha = '2026-11-14';

delete from public.costos_mensuales;
select public.costos_foto_del_mes();
