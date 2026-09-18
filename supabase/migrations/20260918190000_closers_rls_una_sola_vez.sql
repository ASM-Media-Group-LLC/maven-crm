-- Closers: las reglas dejan de releer el JWT en cada fila.
--
-- 18/09/2026, cuarta tanda del mismo patrón (leadgen #1875, perfiles y roles
-- #1880, notificaciones y Cowork #1881). Son 24 políticas en 4 tablas.
--
-- ── POR QUÉ ESTA Y POR QUÉ AHORA ───────────────────────────────────────────
-- Medido en pg_stat_statements, 13 h de instancia Small: la familia Closers se
-- lleva el 23,9% del tiempo de TODA la base con el 0,2% de las consultas.
--
--   closers_contacts        423.850 ms   14,04%   260 llamadas   peor media 6.436 ms
--   closer_creators         208.952 ms    6,92%  3.049 llamadas  peor media 2.594 ms
--   closer_platform_sales    60.972 ms    2,02%     23 llamadas  peor media 2.825 ms
--   closer_contact_history   27.018 ms    0,90%    528 llamadas  peor media   346 ms
--
-- Leen CERO bloques de disco: no es falta de RAM, es CPU quemada releyendo la
-- caché porque la regla se evalúa fila por fila. Por eso el upgrade de instancia
-- no movió esto ni un milímetro y esto sí lo mueve. Medido antes de aplicar,
-- sobre closers_contacts con el JWT de una persona con alcance global:
--
--            forma actual:  493.885 bloques,  18.157 ms
--            envuelta:        1.632 bloques,      14,5 ms
--            (302x menos lecturas, 1.253x más rápido, las mismas 30.766 filas)
--
-- ⚠️ A QUÉ PANTALLA LE TOCA ESA MEJORA. No al listado de Contactos: ese lee la
-- VISTA v_closers_contacts, que es de `postgres` y NO tiene security_invoker, o
-- sea que se SALTA la RLS entera (ContactosContent.tsx y useCloserLeads.ts:435,
-- 588 y 749). Comprobado: con el JWT de Test test, 0 filas por la tabla y 30.766
-- por la vista. La consulta que sí paga la RLS, y que es la más cara de toda la
-- familia, es la analítica del Dashboard de Contactos —565.116 ms en 98 llamadas,
-- media 5.766 ms— que lee la tabla cruda y pagina de a 1.000 filas, o sea ~31
-- vueltas por cada apertura, cada una reevaluando la regla sobre las 30.766.
--
-- ── LO QUE HAY QUE ENTENDER PARA REVISAR ESTO ──────────────────────────────
--
-- `auth.uid()` NO es una variable: parsea un JSON en cada fila. Envolverlo en
-- (SELECT ...) lo convierte en un InitPlan que se resuelve una sola vez.
--
--  (A) LA QUE NO MIRA LA FILA — se envuelve ENTERA, con función y todo:
--      has_contactos_global_scope, has_closer_global_scope, has_permission,
--      is_in_role_group y has_role. Ninguna recibe una columna: solo el uid y
--      una constante. Envolver solo el auth.uid() dejaría la función —que por
--      dentro hace tres uniones— corriendo una vez por fila.
--
--  (B) LA QUE SÍ MIRA LA FILA — solo se envuelve el auth.uid():
--      `assigned_to = auth.uid()`, `created_by = auth.uid()`, los EXISTS
--      correlacionados de closer_contact_history (llevan creator_id de la fila)
--      y el `creator_id IN (...)` de closer_platform_sales.
--
-- ⚠️ TRES TRAMPAS CONCRETAS DE ESTAS TABLAS:
--
--  1. `has_role` está SOBRECARGADA: has_role(uuid,text) y has_role(uuid,app_role).
--     Acá se usa SIEMPRE la del ENUM — `'admin'::app_role`, `'manager'::app_role`.
--     Si se le quita el ::app_role, resuelve a la otra función. No tocar el cast.
--  2. `has_permission` se llama con DOS argumentos y su firma tiene TRES
--     (_user_id, _module, _submodule DEFAULT NULL). Mantener la llamada de dos.
--  3. `closers_contacts` tiene una política PERMISSIVE y otra RESTRICTIVE con el
--     cuerpo IDÉNTICO, así que hoy el trabajo se hace DOS VECES por fila. Se
--     envuelven LAS DOS y NO se borra la restrictiva. Medido en el EXPLAIN: una
--     vez envueltas, Postgres crea los dos InitPlan por separado pero el segundo
--     cuesta 16 bloques en vez de 246.000, porque lo que la función lee por
--     dentro ya quedó en caché. O sea que el duplicado deja de importar y la
--     restrictiva sigue haciendo de tope si mañana alguien agrega otra permisiva
--     de SELECT. Borrarla sería bajar la guardia para ganar 16 bloques.
--
-- Se usa ALTER POLICY en TODAS, nunca DROP+CREATE. ⚠️ Tres están concedidas a
-- {public} y no a {authenticated}: «Supervisors+ view all closer_creators»,
-- «Supervisors+ update closer_creators» y «Supervisors+ view all contact history».
--
-- ⚠️ EL LOCK. ALTER POLICY toma ACCESS EXCLUSIVE sobre la tabla, y estas son las
-- 4 más disputadas de la base. Sin tope, el ALTER espera indefinidamente a que
-- termine un SELECT largo y, mientras espera, la cola de locks es FIFO: TODO lo
-- que llegue nuevo a esas 4 tablas se encola detrás. Eso es exactamente el
-- apilamiento del 17/09. Por eso el archivo abre con lock_timeout: si no
-- consigue el lock en 3 s, aborta limpio y se reintenta. Las tres migraciones
-- anteriores de la serie no lo llevaban; salieron bien porque tocaban tablas
-- más rápidas.
--
-- ── COMPROBACIÓN, antes y después ──────────────────────────────────────────
--
-- Filas visibles simulando SIETE personas reales más `anon`, elegidas para que
-- cada rama la ejerza alguien (set_config del JWT + set local role authenticated,
-- o sea RLS de verdad, no el plan). Acotado a lo creado antes de las 18:30 UTC
-- para que el equipo pueda seguir trabajando sin mover los números.
--
--                      Juan   María  Test test Marielby D.Osp. Andrés Rubén anon
--                      admin  Closer+ superv.  scope    sup.   fuera  sin
--                      global global  SIN scope Cont.SÍ  sin           nada,
--                             no adm  4 asign.  Clos.NO  nada          creó 1
--   closers_contacts   30766  30766      0      30766      0      0      1   (*)
--   closer_creators     2729   2729      4          1      0      0      1    0
--   closer_contact_hist 1718   1718      6          0      0      0      0    0
--   closer_platform_s.    10      0      0          0      0      0      0    0
--
--   (*) anon NO tiene permiso de tabla sobre closers_contacts: el acceso es por
--       COLUMNA (24 columnas a `authenticated`, de la auditoría de PII). Ahí la
--       barrera es el GRANT, no la RLS. En las otras tres sí tiene SELECT de
--       tabla y la RLS es lo único que lo para: tiene que seguir dando 0.
--
-- POR QUÉ ESTAS SIETE. Juan Pachas es admin y sus números SON el total de cada
-- tabla: por sí solo no prueba nada. Las que prueban son las otras:
--
--  · María de los Ángeles Suárez (Closer +) tiene alcance global SIN ser admin:
--    sus 30766/2729/1718 vienen de has_*_global_scope, no de has_role(admin).
--  · Test test es supervisor_or_above pero NO tiene alcance global y tiene 4
--    creadoras asignadas. La permisiva «Supervisors+ view all» le diría que ve
--    las 2729; la RESTRICTIVA lo baja a 4. Es el único número que comprueba que
--    la restrictiva de SELECT sigue apretando.
--    ⚠️ Y NADA MÁS QUE ESO: ese 4 no es una frontera de seguridad. No hay
--    restrictiva de UPDATE en closer_creators, así que cualquier supervisor
--    puede hacer `update closer_creators set assigned_to = <yo>` sobre las 2.729
--    y después leerlas legítimamente por la rama assigned_to. Es de antes y esta
--    migración no lo empeora, pero que no se lea acá como que está acotado.
--  · Marielby Quijada separa los dos alcances globales, que son la confusión más
--    fácil de cometer acá: tiene el de Contactos pero no el de Closers, así que
--    ve 30766 contactos y UNA sola creadora (la que ella creó).
--  · Rubén Guzmán es el ÚNICO de la empresa que ejerce la rama `created_by` de
--    closers_contacts sin tener ningún alcance global. Su 1 es el único número
--    de toda la tabla que muere si esa rama se rompe: los tres que ven 30766 la
--    tienen cortocircuitada por has_contactos_global_scope, y los tres que ven 0
--    no crearon nada. Sin él, romper las dos ramas del OR daría los mismos siete
--    números y la comprobación diría verde.
--  · Daniel Ospina es supervisor sin nada más: todo en 0, y prueba que ser
--    supervisor por sí solo no abre closers_contacts.
--  · Andrés Paredes no tiene ningún rol de estos: el de afuera de verdad.
--
-- LO QUE NO SE PUEDE COMPROBAR CON DATOS, y se dice en vez de disimularlo:
--
--  · La rama `assigned_to = auth.uid()` de closers_contacts es INEJERCITABLE:
--    assigned_to está en NULL en las 30.766 filas. No hay ni puede haber nadie.
--  · La rama del pool sin asignar de closer_creators tampoco: CERO personas
--    tienen has_permission('Closers') sin tener además el alcance global, que ya
--    se las da todas. Son 2.179 filas esperando a alguien que no existe.
--  · La segunda rama de closer_platform_sales tampoco: las 10 ventas son de
--    creadoras con assigned_to NULL, o sea de nadie.
--  · «Managers view all contact history» —la del segundo ::app_role— no la
--    distingue ningún conteo: los cuatro managers reales tienen alcance global
--    en false y 0 filas propias, así que la restrictiva los deja en 0 esté la
--    política bien o rota. Ese cast se comprueba leyendo el qual DESPUÉS de
--    aplicar: tiene que seguir diciendo 'manager'::app_role, no ::text.
--  · Las 8 políticas de escritura no las toca un SELECT y su fallo es MUDO:
--    PostgREST devuelve 0 filas afectadas sin error. Se comprueban evaluando el
--    PREDICADO como expresión, nunca con BEGIN/UPDATE/ROLLBACK:
--      ⚠️ un UPDATE de prueba sobre closer_creators dispara
--      on_closer_creator_assigned → notifications → on_notification_push, o sea
--      un push REAL al teléfono de una persona real por una prueba que ibas a
--      deshacer. Y closer_contact_history tiene enforce_max_contacts, que lanza
--      excepción a las 6 filas por creadora y confunde el diagnóstico.
--
-- ⚠️ DOS COSAS QUE ESTA MIGRACIÓN NO ARREGLA y merecen su propio cambio:
--   (1) v_closers_contacts se salta la RLS (ver arriba).
--   (2) El USING de closers_contacts_update lleva `OR (assigned_to IS NULL)`, y
--       como assigned_to está NULL en las 30.766 filas, esa rama es TRUE para
--       toda la tabla: hoy cualquier authenticated puede autoasignarse cualquier
--       contacto y después leerlo. Se copia tal cual a propósito — cambiar el
--       predicado acá mezclaría permisos con rendimiento y arruinaría la
--       comparación antes/después.
--
-- Para revertir: quitarle el (SELECT ...) a cada expresión. Están todas acá
-- abajo con su forma original en el comentario.

-- Si no consigue el lock en 3 s, aborta limpio en vez de encolar a todo el mundo.
SET lock_timeout = '3s';

-- ── CONTACTOS ──────────────────────────────────────────────────────────────

-- ⚠️ RESTRICTIVA. Cuerpo idéntico al de closers_contacts_select, a propósito.
-- original: (has_contactos_global_scope(auth.uid()) OR (assigned_to = auth.uid())
--            OR (created_by = auth.uid()))
ALTER POLICY "closers_contacts_scope_select" ON public.closers_contacts
  USING (
    (SELECT public.has_contactos_global_scope((SELECT auth.uid())))
    OR (assigned_to = (SELECT auth.uid()))
    OR (created_by = (SELECT auth.uid()))
  );

ALTER POLICY "closers_contacts_select" ON public.closers_contacts
  USING (
    (SELECT public.has_contactos_global_scope((SELECT auth.uid())))
    OR (assigned_to = (SELECT auth.uid()))
    OR (created_by = (SELECT auth.uid()))
  );

-- original: (has_contactos_global_scope(auth.uid()) OR (created_by = auth.uid()))
ALTER POLICY "closers_contacts_delete" ON public.closers_contacts
  USING (
    (SELECT public.has_contactos_global_scope((SELECT auth.uid())))
    OR (created_by = (SELECT auth.uid()))
  );

-- original CHECK: ((created_by = auth.uid()) OR has_contactos_global_scope(auth.uid()))
ALTER POLICY "closers_contacts_insert" ON public.closers_contacts
  WITH CHECK (
    (created_by = (SELECT auth.uid()))
    OR (SELECT public.has_contactos_global_scope((SELECT auth.uid())))
  );

-- ⚠️ El USING lleva un `OR (assigned_to IS NULL)` que el CHECK NO tiene: sirve
-- para poder tomar un contacto libre, pero no para dejarlo en manos de otro.
ALTER POLICY "closers_contacts_update" ON public.closers_contacts
  USING (
    (SELECT public.has_contactos_global_scope((SELECT auth.uid())))
    OR (assigned_to = (SELECT auth.uid()))
    OR (created_by = (SELECT auth.uid()))
    OR (assigned_to IS NULL)
  )
  WITH CHECK (
    (SELECT public.has_contactos_global_scope((SELECT auth.uid())))
    OR (assigned_to = (SELECT auth.uid()))
    OR (created_by = (SELECT auth.uid()))
  );

-- ── CREADORAS ──────────────────────────────────────────────────────────────

-- ⚠️ RESTRICTIVA. Es la que le pone techo a «Supervisors+ view all».
-- original: (has_closer_global_scope(auth.uid()) OR (assigned_to = auth.uid())
--            OR (created_by = auth.uid()) OR ((assigned_to IS NULL)
--            AND (stage = 'Nuevo'::text) AND has_permission(auth.uid(), 'Closers'::text)))
ALTER POLICY "closer_creators_scope_select" ON public.closer_creators
  USING (
    (SELECT public.has_closer_global_scope((SELECT auth.uid())))
    OR (assigned_to = (SELECT auth.uid()))
    OR (created_by = (SELECT auth.uid()))
    OR ((assigned_to IS NULL) AND (stage = 'Nuevo'::text)
        AND (SELECT public.has_permission((SELECT auth.uid()), 'Closers'::text)))
  );

-- ⚠️ ::app_role, NO ::text — es la otra sobrecarga de has_role.
ALTER POLICY "Admins full access on closer_creators" ON public.closer_creators
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

ALTER POLICY "Authenticated users can insert closer_creators" ON public.closer_creators
  WITH CHECK (created_by = (SELECT auth.uid()));

-- original: ((assigned_to IS NULL) AND (stage = 'Nuevo'::text)
--            AND has_permission(auth.uid(), 'Closers'::text))
ALTER POLICY "Closers can view unassigned pool" ON public.closer_creators
  USING (
    (assigned_to IS NULL) AND (stage = 'Nuevo'::text)
    AND (SELECT public.has_permission((SELECT auth.uid()), 'Closers'::text))
  );

ALTER POLICY "Closers see own assigned creators" ON public.closer_creators
  USING (assigned_to = (SELECT auth.uid()));

-- ⚠️ Concedida a {public}, no a {authenticated}.
ALTER POLICY "Supervisors+ view all closer_creators" ON public.closer_creators
  USING ((SELECT public.is_in_role_group((SELECT auth.uid()), 'supervisor_or_above'::text)));

ALTER POLICY "Users see own created closer_creators" ON public.closer_creators
  USING (created_by = (SELECT auth.uid()));

-- ⚠️ Su USING no tiene auth.uid() ((assigned_to IS NULL) AND (stage = 'Nuevo')):
-- se altera SOLO el WITH CHECK y el USING queda como estaba.
ALTER POLICY "Closers can claim unassigned pool" ON public.closer_creators
  WITH CHECK (assigned_to = (SELECT auth.uid()));

ALTER POLICY "Closers update own assigned creators" ON public.closer_creators
  USING (assigned_to = (SELECT auth.uid()))
  WITH CHECK (assigned_to = (SELECT auth.uid()));

-- ⚠️ Concedida a {public}.
ALTER POLICY "Supervisors+ update closer_creators" ON public.closer_creators
  USING ((SELECT public.is_in_role_group((SELECT auth.uid()), 'supervisor_or_above'::text)))
  WITH CHECK ((SELECT public.is_in_role_group((SELECT auth.uid()), 'supervisor_or_above'::text)));

-- ── HISTORIAL DE CONTACTO ──────────────────────────────────────────────────

-- ⚠️ RESTRICTIVA. El EXISTS lleva creator_id DE LA FILA → tipo (B): adentro solo
-- se envuelve el auth.uid(), la subconsulta no se puede sacar del bucle.
-- original: (has_closer_global_scope(auth.uid()) OR (created_by = auth.uid())
--            OR (EXISTS (SELECT 1 FROM closer_creators c
--                        WHERE ((c.id = closer_contact_history.creator_id)
--                               AND (c.assigned_to = auth.uid())))))
ALTER POLICY "closer_contact_history_scope" ON public.closer_contact_history
  USING (
    (SELECT public.has_closer_global_scope((SELECT auth.uid())))
    OR (created_by = (SELECT auth.uid()))
    OR (EXISTS ( SELECT 1
         FROM public.closer_creators c
        WHERE ((c.id = closer_contact_history.creator_id)
               AND (c.assigned_to = (SELECT auth.uid())))))
  );

ALTER POLICY "Admins full access on closer_contact_history" ON public.closer_contact_history
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

ALTER POLICY "Closers insert contact history for own creators" ON public.closer_contact_history
  WITH CHECK (
    EXISTS ( SELECT 1
       FROM public.closer_creators
      WHERE ((closer_creators.id = closer_contact_history.creator_id)
             AND (closer_creators.assigned_to = (SELECT auth.uid()))))
  );

-- original CHECK: (is_in_role_group(auth.uid(), 'supervisor_or_above'::text)
--                  AND (created_by = auth.uid()))
ALTER POLICY "Supervisors+ insert contact history" ON public.closer_contact_history
  WITH CHECK (
    (SELECT public.is_in_role_group((SELECT auth.uid()), 'supervisor_or_above'::text))
    AND (created_by = (SELECT auth.uid()))
  );

ALTER POLICY "Closers see contact history of own creators" ON public.closer_contact_history
  USING (
    EXISTS ( SELECT 1
       FROM public.closer_creators
      WHERE ((closer_creators.id = closer_contact_history.creator_id)
             AND (closer_creators.assigned_to = (SELECT auth.uid()))))
  );

-- ⚠️ ::app_role, y acá es 'manager', no 'admin'.
ALTER POLICY "Managers view all contact history" ON public.closer_contact_history
  USING ((SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role)));

-- ⚠️ Concedida a {public}. Las DOS ramas son tipo (A).
ALTER POLICY "Supervisors+ view all contact history" ON public.closer_contact_history
  USING (
    (SELECT public.is_in_role_group((SELECT auth.uid()), 'supervisor_or_above'::text))
    OR (SELECT public.has_closer_global_scope((SELECT auth.uid())))
  );

-- ── VENTAS POR PLATAFORMA ──────────────────────────────────────────────────

-- ⚠️ Las dos son cmd=ALL con with_check NULL: se altera SOLO el USING, que es de
-- donde Postgres deriva también el chequeo de escritura. Poner un WITH CHECK acá
-- cambiaría el significado.
ALTER POLICY "Admin full access on platform sales" ON public.closer_platform_sales
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

-- original: (creator_id IN ( SELECT closer_creators.id FROM closer_creators
--                            WHERE (closer_creators.assigned_to = auth.uid())))
ALTER POLICY "Closers see own platform sales" ON public.closer_platform_sales
  USING (
    creator_id IN ( SELECT closer_creators.id
                      FROM public.closer_creators
                     WHERE (closer_creators.assigned_to = (SELECT auth.uid())))
  );
