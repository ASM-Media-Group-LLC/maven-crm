-- LO QUE LE TOCA A MAVEN DE CADA SERVICIO, MEDIDO (Alvaro, 14/11/2026).
--
-- «Tiene que llegar al centavo… quién más come o comparte de ahí.» Se abrió la
-- página de cobros de cada proveedor en su Chrome y se midió el uso real de Maven
-- contra el de sus otros negocios. Solo datos: ninguna tabla ni función cambia.
--
--   Claude      USD 255 en el ciclo 17/10–17/11 (Ultra USD 200 + USD 55 de créditos
--               extra del 6–7/11). Maven = 36,7 % del uso de Claude en la Mac de
--               Alvaro, medido proyecto por proyecto a precio de API (48 %, 22 %,
--               33 % y 47 % por semana). 36,7 % × 255 = USD 93,67.
--   ElevenLabs  Creator USD 26,62. Maven generó 62,7 s de voz (~940 créditos) de los
--               8.714 usados en el ciclo; el resto es de Alvaro (otra voz).
--               10,8 % × 26,62 = USD 2,87.
--   Resend      Pro USD 20. En 15 días los 119 correos salieron de envios.maven-ai.me;
--               el otro dominio (onepharmacy.me) está en «Failed» hace 11 meses.
--               100 % Maven. Con ~8 correos al día alcanza el plan gratis.
--   Supabase    Plan Pro USD 25 − USD 10 de crédito + servidores. Maven: servidor
--               grande USD 0,1516/h × 720 h = USD 109,15 + 34,9 % del plan base
--               (su parte de los servidores) = USD 5,24 + almacenamiento extra
--               USD 0,15 → USD 114,54. Las otras 21 bases: USD 203,21 + USD 9,76.
--   Contabo principal (147.93.3.97): no está en la cuenta de Contabo de Alvaro y no
--               se sabe quién lo paga. Lo usan Maven (~10 servicios), OnePharmacy y
--               Piclink: se reparte ~80 % Maven / ~10 % / ~10 % cuando haya monto.
--   Zoho        70 licencias, todas @maven-ai.me (100 % Maven). La cuenta abierta en
--               su Chrome es la de Zentrix (gratis), no la de maven-ai.me: el precio
--               sigue sin verse.

update public.costos_servicios set
  activo = true, monto_usd = 93.67, ciclo = 'mensual', fuente = 'factura',
  detalle = 'Plan Ultra USD 200 + USD 55 de créditos extra (6 y 7/11) = USD 255 en el ciclo 17/10–17/11. Con este se construye y se arregla Maven.',
  como_se_calcula = 'Maven usó el 36,7 % de Claude (medido proyecto por proyecto en la Mac de Alvaro, a precio de API): 36,7 % × USD 255',
  revisado = 'Revisado en claude.ai › Facturas y en el uso de cada proyecto (14/11/2026)'
  where id = 'claude';

update public.costos_servicios set
  monto_usd = 2.87, fuente = 'factura',
  como_se_calcula = 'Maven generó 62,7 s de voz (~940 créditos) de los 8.714 usados en el ciclo: 10,8 % × USD 26,62. El resto lo usa Alvaro con otra voz.',
  revisado = 'Revisado en ElevenLabs › Request Log y en los audios de Maven (14/11/2026)'
  where id = 'elevenlabs';

update public.costos_servicios set
  monto_usd = 20.00, ciclo = 'mensual', fuente = 'factura',
  detalle = 'Solo envía Maven (envios.maven-ai.me): 119 correos en 15 días. El otro dominio, onepharmacy.me, está en «Failed» hace 11 meses.',
  como_se_calcula = 'Plan Pro completo: 100 % Maven',
  ahorro_usd = 20.00,
  ahorro_detalle = 'Bajar a plan gratis (3.000 correos al mes, 100 al día): Maven manda ~8 al día',
  revisado = 'Revisado en Resend › Métricas, Dominios y Facturas (14/11/2026)'
  where id = 'resend';

update public.costos_servicios set
  monto_usd = 114.54, fuente = 'factura',
  como_se_calcula = 'Servidor grande USD 0,1516/h × 720 h = USD 109,15 + 34,9 % del plan base (USD 25 − USD 10 de crédito) = USD 5,24 + almacenamiento extra USD 0,15',
  revisado = 'Revisado en Supabase › Uso, ciclo 14/11–14/12 (14/11/2026)'
  where id = 'supabase_maven';

update public.costos_servicios set
  monto_usd = 212.97, fuente = 'factura',
  detalle = 'Otras 21 bases en la misma cuenta de Supabase (OnePharmacy, BLU, Biora, trafix, Unlok, Lumina, Piclink, letshoot…), no son Maven.',
  como_se_calcula = '21 servidores micro × USD 0,01344/h × 720 h = USD 203,21 + 65,1 % del plan base = USD 9,76',
  revisado = 'Revisado en Supabase › Uso, ciclo 14/11–14/12 (14/11/2026)'
  where id = 'supabase_otros';

update public.costos_servicios set
  fuente = 'falta',
  detalle = 'Donde viven la app, Dokploy y los servicios de Maven. Lo usan también OnePharmacy (onepharmacy.me apunta ahí) y Piclink. No está en la cuenta de Contabo de Alvaro: no se sabe quién lo paga.',
  como_se_calcula = 'Cuando haya monto: ~80 % Maven (corre ~10 servicios), ~10 % OnePharmacy, ~10 % Piclink',
  revisado = 'Revisado el 14/11/2026: la cuenta de Contabo de Alvaro solo tiene el servidor de llamadas; Dokploy pide clave'
  where id = 'contabo_principal';

update public.costos_servicios set
  fuente = 'falta',
  detalle = '70 licencias, todas @maven-ai.me: 100 % Maven. El precio no se ve: la cuenta de Zoho abierta en el Chrome de Alvaro es la de Zentrix (plan gratis), no la de maven-ai.me.',
  revisado = 'Revisado el 14/11/2026: falta la cuenta de Zoho de maven-ai.me'
  where id = 'zoho';
