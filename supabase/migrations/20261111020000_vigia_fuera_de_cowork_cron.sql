-- El vigía «fuera de Cowork» corre cada minuto (Alvaro, 10/11/2026: «al minuto
-- cuenta como falta y le avisa a su supervisor y a ti»). La función vive en
-- 20261111010000_donde_esta_cada_uno.sql; es SQL puro (no hay edge), y la
-- campana dispara el push sola con su trigger. Se aplica al fundir el PR.
select cron.schedule(
  'vigia-fuera-de-cowork',
  '* * * * *',
  $$ select public.vigilar_fuera_de_cowork(); $$
);
