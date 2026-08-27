-- PARRILLA — rango elegible desde el calendario (pedido de Jhon 27/08):
-- "Nueva semana" ahora abre un calendario y la parrilla se forma con los días
-- elegidos. El ciclo ESTÁNDAR sigue siendo lunes → lunes de 8 días (default del
-- picker y lo único que generará el cron de F2), pero la manager puede elegir
-- otro rango a mano — por eso los checks duros de "empieza lunes" y "8 días
-- exactos" se reemplazan por un rango sano de 2 a 10 días.
--
-- El trigger trg_parrilla_day_date sigue siendo ley: la fecha de cada día es
-- SIEMPRE week_start + (day_index - 1) — el calendario no se puede descuadrar.

alter table public.content_grids drop constraint if exists content_grids_empieza_lunes;
alter table public.content_grids drop constraint if exists content_grids_ciclo_8_dias;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'content_grids_rango_valido') then
    alter table public.content_grids
      add constraint content_grids_rango_valido check (week_end - week_start between 1 and 9);
  end if;
end;
$$;
