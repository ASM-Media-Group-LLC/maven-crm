-- Los admins no llevan nota.
--
-- Jhon pidió sacar a Grace, Luis y Juan Pachas — y los tres son admins, igual que los
-- dos que ya se filtraban a mano por nombre (`not ilike '%lopez%'`, `not ilike
-- '%Alvaro%'`). O sea: la regla real siempre fue "admins no", implementada por
-- coincidencia de texto. Se reemplaza por el rol, que además cubre solo a cualquier
-- admin nuevo y deja de depender del nombre — el antipatrón que en esta base ya mordió
-- con dos Álvaro Mejía, tres Juan y dos Daniel.
do $mig$
declare
  src   text;
  viejo text := E'    where p.full_name not ilike \'%lopez%\' and p.full_name not ilike \'%Alvaro%\'\n';
  nuevo text := E'    where not public.has_role(p.id, \'admin\'::app_role)\n      and p.id not in (select profile_id from public.corte_notas_excluidos)\n';
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'corte_cierre_prep';

  if position(viejo in src) = 0 then
    raise exception 'No encontré el filtro por nombre en corte_cierre_prep — abortado sin tocar nada';
  end if;

  src := replace(src, viejo, nuevo);
  execute src;
end
$mig$;
