-- PARRILLA — el calendario es ley (pedido de Jhon 27/08):
--   1) Toda parrilla EMPIEZA LUNES (extract(isodow) = 1).
--   2) El ciclo es de 8 días: week_end = week_start + 7 (lunes → lunes).
--   3) La fecha de cada día se calcula SIEMPRE del calendario:
--      date = week_start + (day_index - 1). Un trigger la fija en cada
--      insert/update (nadie puede desalinearla, ni el front ni la IA de F2),
--      y si cambia week_start las fechas de los días se recalculan en cascada.
--
-- NOTA de orden: los datos de prod ya fueron normalizados antes de aplicar esto
-- (la v14 jue→jue se reacomodó al ciclo lunes 31/08 → lunes 07/09 conservando
-- cada acción en su día de semana natural).

create or replace function public.parrilla_sync_day_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  select week_start + (new.day_index - 1) into new.date
  from content_grids where id = new.grid_id;
  return new;
end;
$$;

drop trigger if exists trg_parrilla_day_date on public.content_grid_days;
create trigger trg_parrilla_day_date
  before insert or update of day_index, date, grid_id on public.content_grid_days
  for each row execute function public.parrilla_sync_day_date();

create or replace function public.parrilla_sync_week_dates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update content_grid_days set date = new.week_start + (day_index - 1)
  where grid_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_parrilla_week_dates on public.content_grids;
create trigger trg_parrilla_week_dates
  after update of week_start on public.content_grids
  for each row
  when (new.week_start is distinct from old.week_start)
  execute function public.parrilla_sync_week_dates();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_grids_empieza_lunes') then
    alter table public.content_grids
      add constraint content_grids_empieza_lunes check (extract(isodow from week_start) = 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_grids_ciclo_8_dias') then
    alter table public.content_grids
      add constraint content_grids_ciclo_8_dias check (week_end = week_start + 7);
  end if;
end;
$$;
