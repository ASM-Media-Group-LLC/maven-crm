-- Ajustes post-estreno del corte 17:00 + feedback de Álvaro (03/08).
-- (Aplicado en prod vía MCP en tres pasos: corte_v2_claims_ventas_activos,
--  dedup de corte_ventas_bloque y v3 de corte_hubstaff_bloque. Este archivo
--  versiona el ESTADO FINAL.)
--
-- 1. corte_claims: candado por (fecha, hora, grupo) — a las 17:00 salieron DOS
--    cortes (pedido por mención + tick manual). El tick reclama antes de
--    disparar; duplicado → saltea. Mismo patrón del dedup del night_catchup.
-- 2. corte_ventas_bloque(): "cuánta plata hay en la mesa" (Jhon) + Ganado HOY
--    DEDUPLICADO por creadora canónica (los handles alias danyancatgaming /
--    danyancatoficial triplicaban ventas) + agenda de hitos del día. Inyectado
--    al corte de Ventas: una venta cerrada sale SÍ o SÍ.
-- 3. corte_hubstaff_bloque v3 (regla de Álvaro 17:04): en los GRUPOS sin horas
--    — solo % de actividad con déficit vs mínimo de compañía 60% ("35% (-25%)",
--    "62% ✓"). La copia al DM (sin p_group_id) conserva horas. Solo miembros
--    ACTIVOS (Álvaro sacó a Lorena/Marie hoy) — igual en corte_cierre_prep.
-- 4. Limpieza: 8 filas won duplicadas de hoy borradas (backup en
--    monetization_opportunities_backup_dupwon_20260803); la tool ahora
--    actualiza en vez de duplicar una won del mismo producto/handle/día.
create table if not exists public.corte_claims (
  fecha date not null,
  hora int not null,
  group_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (fecha, hora, group_id)
);
alter table public.corte_claims enable row level security;
-- Cuerpos de corte_ventas_bloque() y corte_hubstaff_bloque(uuid): ver las
-- migraciones MCP del 03/08 (definiciones completas aplicadas y probadas).
