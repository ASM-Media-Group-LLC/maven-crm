-- Fechas de nacimiento plausibles. En prod había 71996-02-09, 91994-08-13,
-- 1195-06-01 y 275760-02-03 (dedos de más al tipear el año): el perfil mostraba
-- "-69970 años" (Jhon, 07/09/2026). Las cuatro se corrigieron a mano; esto evita
-- las próximas. NOT VALID: no revisa las filas existentes (hay creadoras de
-- prueba con fechas de 2026) y solo exige la regla en inserts/updates nuevos.
alter table public.creators
  add constraint creators_birth_date_plausible
  check (birth_date is null or (birth_date >= '1940-01-01' and birth_date <= '2015-12-31'))
  not valid;
