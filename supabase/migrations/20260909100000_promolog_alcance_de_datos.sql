-- Promolog: que el data_scope del rol se respete de verdad.
--
-- Antes: promolog_entries (80.221 filas) solo tenia el candado de tenant, asi que
-- cualquier persona logueada la leia entera aunque no tuviera el modulo. Y peor,
-- promolog_dispatch_runs tenia su policy TO public (o sea, tambien para anon) con el
-- tenant escrito a mano: 2.703 corridas legibles sin sesion, y su columna payload
-- guarda el input de Apify -- incluida una sessionCookie de Instagram en 288 filas.
--
-- Las policies permisivas se suman con OR, asi que agregar otra permisiva no cierra
-- nada: hay que usar RESTRICTIVE, que se combina con AND sobre la de tenant.

-- 1) Helper de alcance, misma forma que has_closer_global_scope / has_leadgen_global_scope.
--    Compara data_scope <> 'self' para quedar igual que el front, que decide
--    isManagement con dataScope("Promolog") !== "self" (PromologContent.tsx:164).
create or replace function public.has_promolog_global_scope(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_in_role_group(_user_id, 'admin') or exists (
    select 1
    from public.user_roles ur
    join public.roles_config rc on rc.name = ur.role
    join public.role_permissions rp on rp.role_id = rc.id
    where ur.user_id = _user_id
      and rp.module = 'Promolog'
      and rp.submodule is null
      and rp.can_access
      and coalesce(rp.data_scope, 'all') <> 'self'
  );
$function$;

-- Sin este grant las policies tiran "permission denied" para todo el mundo.
grant execute on function public.has_promolog_global_scope(uuid) to authenticated;

-- 2) promolog_entries.
--
--    OJO: tiene que ser FOR ALL, no FOR SELECT. La permisiva que ya existe es FOR ALL,
--    asi que una restrictiva de SELECT no se evalua en UPDATE. Y un UPDATE sin WHERE ni
--    RETURNING no pasa por las policies de SELECT, de modo que cualquier empleado podria
--    hacer `update promolog_entries set created_by = auth.uid()`, declararse dueno de las
--    80.221 filas y despues leerlas por la rama de propiedad de esta misma restrictiva.
--    Con FOR ALL, el USING tambien filtra ese UPDATE masivo.
--
--    El helper va envuelto en (select ...) para que Postgres lo evalue una sola vez
--    como InitPlan y no una vez por cada una de las 80.221 filas.
--
--    USING  = que filas ve / puede tocar. Deja la propiedad para que quien cargo algo
--             suelto lo siga viendo (hoy es 1 sola fila, de Marielby).
--    CHECK  = que puede escribir. Acá si se exige el modulo: el formulario
--             (PromologEntryFormDialog:357) siempre manda created_by y reviewed_by, y
--             todos los bots entran por service_role, que ni evalua RLS.
drop policy if exists promolog_entries_alcance on public.promolog_entries;
create policy promolog_entries_alcance
  on public.promolog_entries
  as restrictive
  for all
  to authenticated
  using (
    (select public.has_promolog_global_scope(auth.uid()))
    or created_by = auth.uid()
    or reviewed_by = auth.uid()
  )
  with check (
    (select public.has_permission(auth.uid(), 'Promolog'::text, null::text))
  );

-- 3) promolog_dispatch_runs: fuera anon, y el gate del SUBMODULO.
--
--    Primero la permisiva deja de aplicar al rol public: anon queda sin ninguna policy
--    que lo habilite, o sea 0 filas. Eso cierra de una la lectura anonima y tambien el
--    INSERT/UPDATE/DELETE anonimo, que la permisiva FOR ALL TO public tenia abierto.
--
--    El gate es 'Promobot', no el modulo, porque la unica pantalla que lee esta tabla es
--    PromobotPanel y esta detras de canAccess("Promolog","Promobot") (PromologContent.tsx:167).
--    Con el gate del modulo quedaban 6 personas (4 manager + 2 Closer +) que no ven la
--    pestana pero si podrian leer la tabla por API. has_permission corta en true para
--    admin antes de mirar submodulos, asi que los 6 admin no se ven afectados.
alter policy promolog_dispatch_runs_tenant_scoped
  on public.promolog_dispatch_runs to authenticated;

drop policy if exists promolog_dispatch_runs_modulo on public.promolog_dispatch_runs;
drop policy if exists promolog_dispatch_runs_promobot on public.promolog_dispatch_runs;
create policy promolog_dispatch_runs_promobot
  on public.promolog_dispatch_runs
  as restrictive
  for all
  to authenticated
  using (
    (select public.has_permission(auth.uid(), 'Promolog'::text, 'Promobot'::text))
    or dispatched_by = auth.uid()
  )
  with check (
    (select public.has_permission(auth.uid(), 'Promolog'::text, 'Promobot'::text))
  );

-- PENDIENTE aparte (no lo toco acá para no ampliar el radio): la permisiva de
-- promolog_dispatch_runs sigue comparando contra un tenant escrito a mano
-- ('30869615-...') en vez de current_tenant_id().
