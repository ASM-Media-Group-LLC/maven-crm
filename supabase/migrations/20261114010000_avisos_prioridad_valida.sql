-- PRIORIDAD VÁLIDA EN LOS AVISOS (13/11/2026).
-- notifications solo acepta priority high | medium | low (trigger
-- validate_notification_fields). vigilar_tiempo_sin_pantalla (20261113200000) y
-- vigilar_cortes_de_llamada (20261111080000, re-creada en 20261112210000) mandaban
-- 'normal': cada corrida que intentaba avisar fallaba entera y se deshacía. Desde las
-- 21:10 UTC del 13/11 no salía ningún «se pasó de su tiempo sin pantalla» ni ningún
-- resumen de turno, y los avisos de «se le cortó la llamada» nunca llegaron.
-- Se re-crean las dos desde su definición actual, cambiando solo 'normal' → 'medium'.
do $$
declare
  f text;
  d text;
begin
  foreach f in array array['public.vigilar_tiempo_sin_pantalla()', 'public.vigilar_cortes_de_llamada()'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('''normal''' in d) > 0 then
      execute replace(d, '''normal''', '''medium''');
    end if;
  end loop;
end
$$;
