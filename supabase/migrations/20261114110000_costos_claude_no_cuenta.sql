-- CLAUDE NO ES COSTO DE MAVEN (Alvaro, 14/11/2026: «No contarlo»).
-- Medido, Maven es ~37 % de su uso de Claude (38,8 % de los mensajes, 33,9 % de lo
-- escrito, 36,7 % a precio de API), pero Claude es su herramienta de trabajo y no
-- entra en el costo de la plataforma. Queda en la lista, apagado, con la medición.
update public.costos_servicios set
  activo = false,
  detalle = 'Herramienta de trabajo de Alvaro: no cuenta en el costo de Maven (decisión del 14/11/2026). Medido: Maven es ~37 % de su uso (USD 255 en el ciclo 17/10–17/11).',
  revisado = 'Revisado en claude.ai › Facturas y en el uso de cada proyecto (14/11/2026)'
  where id = 'claude';

update public.costos_servicios set
  detalle = 'La cuenta de Resend mandó 120 correos en 30 días, todos de Maven (envios.maven-ai.me) y todos desde el 10/11; antes no se mandaba nada. El otro dominio, onepharmacy.me, está en «Failed».'
  where id = 'resend';
