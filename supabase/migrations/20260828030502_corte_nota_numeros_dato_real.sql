-- El objetivo 'numeros' cuenta el dato REAL de Maven, no el auto-reporte.
--
-- La fórmula usaba greatest(auto_reportado, real), así que el auto-reporte no podía ser
-- contradicho por el dato — y con eso el arreglo de "sin resultado no hay 9.5" se
-- saltea con solo reportar más alto. Medido en Daniel: el 14/08 reportó 10 números y en
-- Maven hay 0; el 18/08 reportó 11 y hay 4; el 24/08 reportó 6 y hay 1. Simulado sobre
-- el 14/08: 5.1 con el dato real vs 9.6 si valiera el auto-reporte.
--
-- Cargar el número en Maven ES el trabajo, así que contarlo desde ahí alinea el
-- incentivo con lo que viene pidiendo Álvaro ("todo lo que escriban, pónganlo en el
-- robot"). El auto-reporte no se pierde: queda expuesto como 'numeros_auto_reportados'
-- cuando es mayor que el real, para que el bot lo pueda señalar.
do $mig$
declare
  src text;
  viejo text := $q$          0.75 * least(greatest(coalesce(r.numeros_obtenidos,0), coalesce(x.numeros_maven,0))::numeric
                       / nullif(ob.meta_diaria,0), 1)$q$;
  nuevo text := $q$          0.75 * least(coalesce(x.numeros_maven,0)::numeric
                       / nullif(ob.meta_diaria,0), 1)$q$;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='corte_cierre_prep';

  if position(viejo in src) = 0 then
    raise exception 'No encontré el componente de números — abortado sin tocar nada';
  end if;

  src := replace(src, viejo, nuevo);
  execute src;
end
$mig$;
