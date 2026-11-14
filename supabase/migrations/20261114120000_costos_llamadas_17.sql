-- El servidor de llamadas cuesta USD 17 al mes (Alvaro lo vio en su Contabo, 14/11/2026).
-- Los USD 26,85 del 15/10 fueron la orden de compra, no la mensualidad.
update public.costos_servicios set
  monto_usd = 17.00, fuente = 'factura',
  revisado = 'Monto mensual que Alvaro ve en su Contabo (14/11/2026); los USD 26,85 del 15/10 fueron la orden de compra'
  where id = 'contabo_llamadas';
