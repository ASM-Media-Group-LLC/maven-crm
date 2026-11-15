-- LO QUE DICE EL PROVEEDOR QUE VA GASTADO EN EL MES (14/11/2026).
--
-- Para el tablero de gasto de Costos (Alvaro: «Maven en vivo + cuadre con Google»).
-- Google no da el gasto de Gemini por API: se lee en AI Studio (Billing) y se anota
-- como una LECTURA: «lo gastado en el mes hasta esta fecha». No es un cobro (Gemini
-- es prepago: lo que sale de la tarjeta son las recargas), así que no se suma como
-- factura. El tablero toma la última lectura del mes como base y le suma lo que
-- Maven calcula foto por foto después de esa fecha.
--
-- La fila del 11/11 (USD 17,44 «Uso del 1 al 11») era una lectura, no una factura.

alter table public.costos_cobros drop constraint if exists costos_cobros_fuente_check;
alter table public.costos_cobros add constraint costos_cobros_fuente_check
  check (fuente in ('factura', 'estimado', 'lectura'));

update public.costos_cobros
   set fuente = 'lectura'
 where servicio_id = 'google_ia' and fecha = '2026-11-11' and monto_usd = 17.44;

insert into public.costos_cobros (servicio_id, fecha, monto_usd, fuente, nota)
select 'google_ia', '2026-11-13', 30.16, 'lectura', 'Gastado del 1 al 13/11 según AI Studio › Billing (leído el 14/11)'
 where not exists (select 1 from public.costos_cobros where servicio_id = 'google_ia' and fecha = '2026-11-13' and fuente = 'lectura');
