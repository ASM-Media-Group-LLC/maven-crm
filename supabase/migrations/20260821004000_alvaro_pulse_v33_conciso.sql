-- alvaro_pulse v3.3 — pulso más corto/conciso (pedido de Álvaro 08/2026: menos texto).
-- Solo se afina el ENVOLTORIO (encabezados largos, coletillas repetidas, glosario);
-- NO se toca ninguna query, ni un dato, nombre, monto, hito ni la lista de intervención.
-- SE PRESERVAN los caveats interpretativos: "día vencido" en la caída y la nota de
-- sync de BLU (evitan malinterpretar las cifras del DM).
--
-- Técnica: se parte del cuerpo VIVO en prod (pg_get_functiondef) y se aplican reemplazos
-- de string exactos, luego CREATE OR REPLACE. Idempotente: si ya se aplicó, los OLD no
-- existen y los replace() son no-op (re-crea la misma función). Evita transcribir a mano
-- las ~600 líneas que no cambian (y que ya driftearon respecto al archivo v32).
DO $do$
DECLARE
  src text;
BEGIN
  src := pg_get_functiondef('public.alvaro_pulse(boolean)'::regprocedure);

  -- Encabezados de sección a una palabra (se conserva el contexto que importa)
  src := replace(src, '*Promo hoy* (piso: se detecta durante el día)', '*Promo*');
  src := replace(src, '*Contacto hoy* (línea Managers · Plus=Carolina, Massive=Fabiana)', '*Contacto* (Plus=Carolina · Massive=Fabiana)');
  src := replace(src, '*Managers en Hubstaff hoy*', '*Hubstaff*');
  src := replace(src, '*Closers en Hubstaff hoy*', '*Hubstaff*');
  src := replace(src, '*Modelos en caída*', '*En caída*');        -- se conserva "(… , día vencido)"
  src := replace(src, '*Hitos de hoy*', '*Hitos*');
  src := replace(src, '*Del grupo hoy*', '*Del grupo*');

  -- MANAGERS · promo: quitar coletilla repetida por línea
  src := replace(src, ' promocionaron hoy', '');

  -- MANAGERS · contacto: frases más cortas (mismos números)
  src := replace(src, ' con 3+ días sin contacto', ' sin contacto 3+ d');
  src := replace(src, ' sin registro)', ' sin reg)');
  src := replace(src, ' ⚠️ bajo (esperable ~', ' ⚠️ bajo (~');

  -- MANAGERS · concentración: oración larga → telegráfica (conserva números y nombres)
  src := replace(src, 'mensajes de la línea fueron a solo 2 creadoras', 'msgs a 2 creadoras');

  -- VENTAS · pipeline + intervención (conserva todos los conteos y la lista)
  src := replace(src, ' completadas hoy*', ' completadas*');
  src := replace(src, ' confirmadas por firmar', ' por firmar');
  src := replace(src, ' ganados este mes*', ' ganados/mes*');
  src := replace(src, ' tomadas hoy)', ' hoy)');
  src := replace(src, 'confirmada hace %s días)', 'hace %sd)');
  src := replace(src, '👉 *Conviene que intervengas* (alto valor frenado 3+ días sin cierre): ', '👉 *Intervén* (alto valor, 3+ d sin cierre): ');

  -- WARMING · sin señales + glosario de pie
  src := replace(src, 'sin señales hoy (ni Hubstaff, ni mensajes, ni números)', 'sin señales hoy');
  src := replace(src, ' — feed de Hubstaff atrasado, las horas no son concluyentes', ' (feed Hubstaff atrasado)');
  src := replace(src, '_corte = reporte del día registrado por el bot · perfiles/números = cargados en Maven · % = actividad Hubstaff._', '_corte = reporte del día · % = actividad Hubstaff_');

  EXECUTE src;
END
$do$;
