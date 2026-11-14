-- PRECIO POR FOTO JUZGADA, CUADRADO CON LA FACTURA (13/11/2026).
-- 20261114060000 puso USD 0,0026 (USD 5,61 / 2.157 fotos de un solo día). Con el
-- mes entero cuadra mejor: AI Studio cobró USD 30,16 del 1 al 13/11 por 17.026
-- fotos juzgadas → USD 0,00177. Se redondea a 0,0018.
update public.costos_servicios set
  precio_unitario_usd = 0.0018,
  como_se_calcula = 'Fotos juzgadas por Argos × USD 0,0018 (AI Studio, 1–13/11: USD 30,16 por 17.026 fotos juzgadas)'
  where id = 'google_ia';
