-- Cada persona se mide por SU objetivo, no por la primera métrica que no sea cero.
--
-- Medido el 27/08: Daniel sacó 9.5 con `numeros: 0` porque la cascada cayó a `posts`
-- (12) y le dio avance = 1.0, que vale 6 de los 10 puntos. Y a María (closer) y a las
-- managers se les emitía `numeros: 0` en los insumos, que el modelo narraba como
-- incumplimiento aunque su trabajo no sea ese.
--
-- Ediciones quirúrgicas sobre la fuente en vez de reescribir la función entera (12k
-- chars, con lógica de matcheo de managers por teléfono que es fácil de romper).
-- Cada paso aborta si no encuentra su ancla exacta.
do $mig$
declare
  src text;
  a_old text; a_new text; b_old text; b_new text;
  c_old text; c_new text; d_old text; d_new text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='corte_cierre_prep';

  a_old := $q$  calc as (
    select mi.group_id, mi.pid, mi.nombre,$q$;
  a_new := $q$  calc as (
    select mi.group_id, mi.pid, mi.nombre,
      ob.metrica as objetivo, coalesce(ob.meta_diaria, 1) as meta,$q$;
  if position(a_old in src) = 0 then raise exception 'A: no encontré el select de calc'; end if;
  src := replace(src, a_old, a_new);

  b_old := $q$    from miembros mi
    left join msgs ms on ms.pid = mi.pid$q$;
  b_new := $q$    from miembros mi
    left join corte_objetivos ob on ob.profile_id = mi.pid
    left join msgs ms on ms.pid = mi.pid$q$;
  if position(b_old in src) = 0 then raise exception 'B: no encontré el from de calc'; end if;
  src := replace(src, b_old, b_new);

  -- El resultado PRINCIPAL manda (75%); lo secundario suma hasta 25%.
  c_old := $q$      case
        when pm.roster is not null then$q$;
  c_new := $q$      case
        when ob.metrica = 'numeros' then
          0.75 * least(greatest(coalesce(r.numeros_obtenidos,0), coalesce(x.numeros_maven,0))::numeric
                       / nullif(ob.meta_diaria,0), 1)
          + 0.25 * greatest(
              least(coalesce(r.contactados,0) / 60.0, 1),
              least((coalesce(r.piezas,0) + coalesce(r.posts,0)) / 6.0, 1))
        when ob.metrica = 'contenido' then
          least((coalesce(r.piezas,0) + coalesce(r.posts,0))::numeric / nullif(ob.meta_diaria,0), 1)
        when ob.metrica = 'cierres' then
          case when x.ventas_won_hoy > 0 then 1.0
               when x.confirmadas_hoy > 0 or x.completadas_hoy > 0 then 0.85
               else 0.7 * least(coalesce(x.gestiones,0) / 15.0, 1) end
        when ob.metrica = 'promo' then
          0.2 * least(coalesce(cm.contactadas,0) / 8.0, 1)
          + 0.8 * (coalesce(pm.con_promo,0)::numeric / nullif(pm.roster,0))
        when ob.metrica = 'ninguna' then null
        when pm.roster is not null then$q$;
  if position(c_old in src) = 0 then raise exception 'C: no encontré el case de avance'; end if;
  src := replace(src, c_old, c_new);

  -- Insumos: emitir SOLO las métricas del objetivo, y decir cuál es.
  d_old := $q$        'numeros', case when n.sin_metricas_tabla then null else greatest(coalesce(n.numeros_obtenidos,0), coalesce(n.numeros_maven,0)) end,$q$;
  d_new := $q$        'objetivo', n.objetivo,
        'numeros', case when coalesce(n.objetivo,'numeros') <> 'numeros' or n.sin_metricas_tabla then null
                        else greatest(coalesce(n.numeros_obtenidos,0), coalesce(n.numeros_maven,0)) end,
        'numeros_auto_reportados', case when coalesce(n.objetivo,'numeros') = 'numeros'
                                          and coalesce(n.numeros_obtenidos,0) > coalesce(n.numeros_maven,0)
                                        then n.numeros_obtenidos end,$q$;
  if position(d_old in src) = 0 then raise exception 'D: no encontré el insumo numeros'; end if;
  src := replace(src, d_old, d_new);

  execute src;
end
$mig$;
