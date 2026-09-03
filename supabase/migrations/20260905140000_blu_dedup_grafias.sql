-- LA MISMA CUENTA DE OF ENTRABA DOS VECES.
--
-- El índice único de `creator_daily_earnings` era sobre el nombre EXACTO +
-- fecha, así que cuando BLU mandaba el nombre con otra capitalización entraba
-- una segunda fila del mismo día: `alissblondvip` y `Alissblondvip` con los
-- MISMOS montos en los MISMOS días. Y como `import_blu_fans` escribía en una
-- grafía y `import_blu_earnings` en la otra, ninguna de las dos filas quedaba
-- completa (una tenía los fans, la otra la plata).
--
-- Medido antes de tocar nada: 625 días-cuenta duplicados en 9 cuentas, con
-- $11.768 de bruto contado dos veces. En 617 de los 625 la fila con fans tenía
-- igual o más plata que la otra, y es la que el bridge sigue actualizando: esa
-- es la canónica.
--
-- Se respalda TODO lo que se borra (no se depende de un backup del proyecto) y
-- después se borra. El índice que lo impide de raíz va en la migración
-- siguiente, que tiene que correr DESPUÉS de esta.
create table if not exists public.creator_daily_earnings_backup_dedup_20260903 (
  like public.creator_daily_earnings including defaults
);
alter table public.creator_daily_earnings_backup_dedup_20260903
  add column if not exists motivo text,
  add column if not exists grafia_que_queda text;

alter table public.creator_daily_earnings_backup_dedup_20260903 enable row level security;
drop policy if exists cdeb_dedup_management on public.creator_daily_earnings_backup_dedup_20260903;
create policy cdeb_dedup_management on public.creator_daily_earnings_backup_dedup_20260903
  for select to authenticated
  using (coalesce(public.blu_is_management(auth.uid()), false));

-- Se queda la fila canónica: la que tiene fans; empate → más plata; después la
-- importada más recientemente.
with rank as (
  select e.id,
         row_number() over (
           partition by lower(trim(e.blu_creator_name)), e.date
           order by (coalesce(e.active_fans,0) > 0) desc, e.total_gross desc, e.imported_at desc nulls last
         ) as puesto,
         first_value(e.blu_creator_name) over (
           partition by lower(trim(e.blu_creator_name)), e.date
           order by (coalesce(e.active_fans,0) > 0) desc, e.total_gross desc, e.imported_at desc nulls last
         ) as grafia_ganadora
  from public.creator_daily_earnings e
)
insert into public.creator_daily_earnings_backup_dedup_20260903
select e.*, 'grafia duplicada (misma cuenta, distinta capitalizacion)', r.grafia_ganadora
from public.creator_daily_earnings e
join rank r on r.id = e.id
where r.puesto > 1;

delete from public.creator_daily_earnings e
using public.creator_daily_earnings_backup_dedup_20260903 b
where b.id = e.id;

-- Verificado en prod: 42.879 → 42.254 filas y $5.166.147 → $5.154.378 de bruto
-- (−$11.769, exactamente lo respaldado), cero grupos duplicados restantes.
