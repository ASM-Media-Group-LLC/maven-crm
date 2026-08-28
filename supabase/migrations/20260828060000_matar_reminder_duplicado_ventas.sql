-- El recordatorio de las 22:28 UTC en Marketing/Ventas pedía "@Miguel @María — chequeo
-- cada 2h: ¿cuántos textos/contactos mandaron en estas últimas 2 horas? Respuestas,
-- agendadas, qué quedó en Maven".
--
-- Eso es EXACTAMENTE lo que whatsapp-corte-tick ya hace en ese mismo grupo cuatro veces
-- al día (arma la ventana de 130 min y pide el resumen del período). Mismo trabajo,
-- cobrado dos veces, y más caro: $0,58 por corrida el reminder contra $0,30 el corte.
-- 22 días hábiles × $0,58 ≈ $12,8/mes.
update public.whatsapp_reminders
   set status = 'cancelled',
       error  = 'Duplicaba el corte_2h del mismo grupo (mismo pedido, 2x el precio) — cancelado 28/08/2026'
 where group_id = 'd12ec56f-b324-4369-b72d-7540fb930ef6'
   and status in ('pending','scheduled')
   and body ilike '%chequeo cada 2h%';
