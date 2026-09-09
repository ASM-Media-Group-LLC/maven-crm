-- TANDA 3 · Creadoras: el alcance va DENTRO de la vista.
--
-- `v_creators` es un `SELECT <130 columnas> FROM creators` SIN filtro, que corre
-- como su dueño (postgres) para poder enmascarar teléfono y correo
-- (is_phone_privileged → mask_phone / mask_email). Al no aplicar la RLS de
-- `creators`, devolvía las 342 a cualquiera con sesión: la tabla daba 0 a un
-- Chatter y la vista se las mostraba todas.
--
-- ⚠️ Ponerle `security_invoker` NO sirve y ya se probó EN PROD: `authenticated`
-- no tiene SELECT sobre `creators` (revocado a propósito en la auditoría de PII),
-- así que la vista quedaba sin poder leer su propia tabla y Creadoras se caía
-- para TODOS, admin incluido (~90 s de rotura, revertido de inmediato). La vista
-- definer es EL camino de lectura. El filtro va adentro.
--
-- (1) La policy de la tabla suma al CHATTER: la ficha de trabajo de su modelo
--     asignada (CreadorRosterRoute + useCreadorById) funcionaba sólo porque la
--     vista saltaba la RLS. Sin esto, 25 chatters pierden sus 5-8 creadoras.
-- (2) La vista aplica el MISMO predicado, así que tabla y vista dicen lo mismo.
--
-- Impacto medido con una vista sombra ANTES de aplicar, y verificado después:
--   admin 342 (teléfono real) · Finanzas 342 · Chatter 7 (teléfono •••4608) ·
--   Coordinador 0. Los 29 de los 10 roles CON el módulo no cambian.

-- (1)
drop policy if exists creators_scope_select on public.creators;
create policy creators_scope_select on public.creators
  as restrictive for select to authenticated
  using (
    has_creators_global_scope(auth.uid())
    or closer_responsible_id = auth.uid()
    or assigned_manager_id = auth.uid()
    or chatter_can_view_creator(auth.uid(), id)
  );

-- (2) La definición se toma de la vista viva y se le agrega el WHERE, para no
--     reescribir a mano las 130 columnas ni el enmascarado.
do $$
declare v_def text;
begin
  select rtrim(btrim(pg_get_viewdef('public.v_creators'::regclass, true)), ';') into v_def;

  if position('FROM creators' in v_def) = 0 then
    raise exception 'La definición de v_creators cambió de forma; revisar a mano antes de filtrar.';
  end if;
  if position(' WHERE ' in upper(v_def)) > 0 then
    raise notice 'v_creators ya tiene WHERE; no se vuelve a envolver.';
    return;
  end if;

  execute 'create or replace view public.v_creators as ' || v_def || '
    where public.has_creators_global_scope(auth.uid())
       or closer_responsible_id = auth.uid()
       or assigned_manager_id   = auth.uid()
       or public.chatter_can_view_creator(auth.uid(), id)';
end $$;
