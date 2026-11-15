-- ELEVENLABS EN USD 0 Y RESEND PRO SE QUEDA (Alvaro, 15/11/2026, Q&A tras el análisis).
--   · ElevenLabs: Maven usa menos del 1 % del plan Creator de Alvaro (la voz de Argos y
--     de los avisos; cada frase se genera una vez y se guarda). «USD 0: cabe en mi plan».
--     Si Alvaro deja su plan, Maven necesita el Starter de USD 6 al mes.
--   · Resend: Maven manda ~4 correos al día (avisos de Entrada tarde / Sin cámara al
--     inicio y recuperar contraseña); el plan gratis alcanzaba, pero decidió «Dejar
--     Resend Pro»: se cuentan USD 20 y ya no se sugiere bajarlo.
update public.costos_servicios set
  monto_usd = 0.00, ciclo = 'mensual', fuente = 'factura',
  detalle = 'Maven usa menos del 1 % del plan Creator de Alvaro (la voz de Argos y de los avisos; cada frase se genera una vez y se guarda). Cabe en su plan: USD 0 para Maven (decisión del 15/11/2026).',
  como_se_calcula = 'USD 0: Maven va dentro del plan que Alvaro paga por lo suyo. Si deja el plan, Maven necesita el Starter de USD 6 al mes.',
  ahorro_usd = null, ahorro_detalle = null
  where id = 'elevenlabs';

update public.costos_servicios set
  ahorro_usd = null, ahorro_detalle = null,
  como_se_calcula = 'Plan Pro completo: 100 % Maven (decisión del 15/11/2026: se queda en Pro)'
  where id = 'resend';
