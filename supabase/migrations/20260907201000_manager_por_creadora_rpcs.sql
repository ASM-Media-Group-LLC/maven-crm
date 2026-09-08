-- MANAGER POR CREADORA, parte 2 (aplicada a prod vía MCP el 07/09): las 4 RPCs
-- que hardcodeaban la regla Massive=Fabiana/Plus=Carolina pasan a atribuir por
-- el manager de la FICHA (creators.assigned_manager_profile_id → profiles.full_name,
-- join que ya existía como fallback). Cirugía por replace exacto sobre
-- pg_get_functiondef para no reescribir funciones enormes a mano:
--   · alvaro_pulse: el case por kash_type se eliminó (queda el split_part sobre
--     p.full_name) y la etiqueta "(Plus=Carolina · Massive=Fabiana)" pasó a
--     "(por manager asignada en la ficha)".
--   · corte_cierre_prep: ídem (case eliminado).
--   · get_blu_sales_summary: la advertencia ahora dice que Plus/Massive son
--     cuentas BLU y el manager es el de la ficha.
--   · get_sub_pricing (overload p_manager): fuera el atajo carolina↔Plus /
--     fabiana↔Massive; el filtro pm.full_name ilike p_manager||'%' ya cubre.
-- Guardas: cada función se re-verificó con `src ~* 'carolina|fabiana'` antes
-- del execute, y un DO final confirma que ninguna de las 4 conserva nombres.

do $$
declare
  src text;
begin
  select pg_get_functiondef(oid) into src from pg_proc
  where pronamespace = 'public'::regnamespace and proname = 'alvaro_pulse';
  src := replace(src,
$f$case when cb.kash_type = 'Plus' then 'Carolina'
           when cb.kash_type = 'Massive' then 'Fabiana'
           else split_part(coalesce(p.full_name, '(sin manager)'), ' ', 1) end as mgr$f$,
$f$split_part(coalesce(p.full_name, '(sin manager)'), ' ', 1) as mgr$f$);
  src := replace(src, '(Plus=Carolina · Massive=Fabiana)', '(por manager asignada en la ficha)');
  if src ~* 'carolina|fabiana' then raise exception 'alvaro_pulse: quedó un hardcode'; end if;
  execute src;

  select pg_get_functiondef(oid) into src from pg_proc
  where pronamespace = 'public'::regnamespace and proname = 'corte_cierre_prep';
  src := replace(src,
$f$case when cb.kash_type = 'Plus' then 'Carolina'
                when cb.kash_type = 'Massive' then 'Fabiana'
                else split_part(coalesce(p.full_name,'-'),' ',1) end as mgr$f$,
$f$split_part(coalesce(p.full_name,'-'),' ',1) as mgr$f$);
  if src ~* 'carolina|fabiana' then raise exception 'corte_cierre_prep: quedó un hardcode'; end if;
  execute src;

  select pg_get_functiondef(oid) into src from pg_proc
  where pronamespace = 'public'::regnamespace and proname = 'get_blu_sales_summary';
  src := replace(src, 'Plus=Carolina, Massive=Fabiana.',
    'Plus y Massive son cuentas BLU; el manager de cada creadora es el de su ficha en Maven.');
  if src ~* 'carolina|fabiana' then raise exception 'get_blu_sales_summary: quedó un hardcode'; end if;
  execute src;

  select pg_get_functiondef(oid) into src from pg_proc
  where pronamespace = 'public'::regnamespace and proname = 'get_sub_pricing'
    and prosrc ilike '%carolina%';
  if src is not null then
    src := regexp_replace(src,
      '\s*or \(lower\(p_manager\) like ''carolina%'' and cb\.kash_type = ''Plus''\)\s*or \(lower\(p_manager\) like ''fabiana%'' and cb\.kash_type = ''Massive''\)',
      '', 'g');
    if src ~* 'carolina|fabiana' then raise exception 'get_sub_pricing: quedó un hardcode'; end if;
    execute src;
  end if;
end;
$$;

do $$
declare v int;
begin
  select count(*) into v from pg_proc
  where pronamespace = 'public'::regnamespace
    and proname in ('alvaro_pulse','corte_cierre_prep','get_sub_pricing','get_blu_sales_summary')
    and prosrc ~* 'carolina|fabiana';
  if v > 0 then raise exception 'quedan % funciones con nombres hardcodeados', v; end if;
end;
$$;
