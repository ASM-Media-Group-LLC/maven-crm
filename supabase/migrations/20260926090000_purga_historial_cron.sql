-- Limpieza diaria del historial de pg_cron (cron.job_run_details).
--
-- pg_cron anota cada corrida de cada job y nunca borra nada: al 25/09 había
-- 617 mil filas (455 MB) desde abril, 7 mil nuevas por día con los 51 jobs
-- activos. El despertador de los webhooks corre cada 15 s y suma otras 5.760
-- por día, así que sin esto la tabla crece más rápido todavía.
--
-- Se guardan 7 días: alcanza para mirar por qué falló un job anoche o la
-- semana pasada, que es para lo único que se lee esta tabla.

create or replace function public.app_purgar_historial_cron(
  p_dias int default 7,
  p_lote int default 5000,
  -- Tope por vuelta, para que la primera corrida (568 mil filas viejas) no sea
  -- un solo borrado gigante a la hora en que la base ya estuvo al límite. Lo
  -- que sobre se borra en los pases siguientes: con 150 mil por noche el
  -- atraso se va en 4 días.
  p_tope int default 150000
)
returns int
language plpgsql
-- INVOKER a propósito: el cron corre como postgres, que ya puede borrar acá.
-- Así, aunque alguien le diera EXECUTE a otro rol, ese rol no gana permisos.
security invoker
set search_path = cron, pg_temp
as $$
declare
  v_limite timestamptz := now() - make_interval(days => p_dias);
  v_lo bigint;
  v_hi bigint;
  v_medio bigint;
  v_runid bigint;
  v_inicio timestamptz;
  v_corte bigint;
  v_desde bigint;
  v_ancho int;
  v_n int;
  v_borradas int := 0;
begin
  if p_dias < 1 then
    raise exception 'p_dias tiene que ser al menos 1 (llegó %)', p_dias;
  end if;
  if p_lote < 1 or p_tope < 1 then
    raise exception 'p_lote y p_tope tienen que ser positivos (llegaron % y %)', p_lote, p_tope;
  end if;

  -- runid sale de una secuencia, así que crece con el tiempo: la última
  -- corrida vieja marca el corte y todo lo de runid menor también es viejo.
  --
  -- El corte se busca por bisección sobre la llave primaria (unas 20
  -- lecturas de índice) porque la tabla no tiene índice por fecha y no es
  -- nuestra (es de supabase_admin): buscarlo con un WHERE start_time leería
  -- el archivo entero, y el archivo NO se achica al borrar, así que serían
  -- 439 MB cada noche aunque queden solo 7 días de filas.
  select min(runid), max(runid) into v_lo, v_hi from cron.job_run_details;
  if v_lo is null then
    return 0;
  end if;
  v_desde := v_lo;

  while v_lo <= v_hi loop
    v_medio := v_lo + (v_hi - v_lo) / 2;
    select runid, start_time into v_runid, v_inicio
    from cron.job_run_details
    where runid >= v_medio
    order by runid
    limit 1;
    -- Un start_time nulo cuenta como reciente: ante la duda, no se borra.
    if v_inicio < v_limite then
      v_corte := v_runid;
      v_lo := v_runid + 1;
    else
      v_hi := v_medio - 1;
    end if;
  end loop;

  if v_corte is null then
    return 0;
  end if;

  while v_desde <= v_corte and v_borradas < p_tope loop
    -- Un rango de runid nunca tiene más filas que su ancho: achicarlo al
    -- final asegura que no se pase del tope.
    v_ancho := least(p_lote, p_tope - v_borradas);
    delete from cron.job_run_details
    where runid >= v_desde
      and runid < v_desde + v_ancho
      and runid <= v_corte;
    get diagnostics v_n = row_count;
    v_borradas := v_borradas + v_n;
    v_desde := v_desde + v_ancho;
  end loop;

  return v_borradas;
end;
$$;

revoke all on function public.app_purgar_historial_cron(int, int, int) from public;
revoke all on function public.app_purgar_historial_cron(int, int, int) from anon;
revoke all on function public.app_purgar_historial_cron(int, int, int) from authenticated;
revoke all on function public.app_purgar_historial_cron(int, int, int) from service_role;

-- 3:30 de la mañana en Bogotá, después de las otras purgas (4:00 y 7:00 UTC).
select cron.unschedule('purgar-historial-cron')
where exists (select 1 from cron.job where jobname = 'purgar-historial-cron');

select cron.schedule(
  'purgar-historial-cron',
  '30 8 * * *',
  $cron$ select public.app_purgar_historial_cron(7, 5000, 150000); $cron$
);
