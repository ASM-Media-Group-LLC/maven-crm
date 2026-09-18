-- Notificaciones y Cowork: las reglas dejan de releer el JWT en cada fila.
--
-- 18/09/2026, tercera tanda del mismo patrón (leadgen #1875, perfiles y roles
-- #1880). Son 24 políticas en 11 tablas.
--
-- ── LO QUE HAY QUE ENTENDER PARA REVISAR ESTO ──────────────────────────────
--
-- `auth.uid()` NO es una variable: es
--    COALESCE(NULLIF(current_setting('request.jwt.claim.sub',true),''),
--             (NULLIF(current_setting('request.jwt.claims',true),''))::jsonb ->> 'sub')::uuid
-- o sea que PARSEA UN JSON en cada fila. Envolverlo en (SELECT ...) lo convierte
-- en un InitPlan que se resuelve una sola vez por consulta.
--
-- Hay DOS tipos de política acá y NO se tratan igual:
--
--  (A) LA QUE NO MIRA LA FILA — se envuelve ENTERA.
--      `is_in_role_group(auth.uid(),'supervisor_or_above')` da lo mismo para
--      todas las filas, así que se envuelve completa y la función se ejecuta una
--      vez. Envolver solo el auth.uid() dejaría la función corriendo por fila.
--
--  (B) LA QUE SÍ MIRA LA FILA — solo se envuelve el auth.uid().
--      `is_cowork_host(auth.uid(), session_id)` depende de `session_id`, que
--      cambia fila a fila: no se puede sacar del bucle. Lo que sí se saca es el
--      parseo del JWT. El EXPLAIN sigue diciendo
--      `Filter: is_cowork_host((InitPlan 1).col1, session_id)`: la función
--      SECURITY DEFINER, que por dentro consulta, sigue corriendo por fila.
--      Igual con is_cowork_member, get_cowork_user_room y user_has_role_name
--      (que depende de `role_target`).
--
-- Se usa ALTER POLICY en TODAS, nunca DROP+CREATE, para no poder cambiar por
-- accidente si son permisivas o restrictivas, a qué comando aplican ni a qué
-- roles. ⚠️ Ojo: SEIS de estas políticas están concedidas a {public} y no a
-- {authenticated} — las tres de `cowork_llamados` Y las tres de `notifications`
-- (SELECT, UPDATE y DELETE). O sea que también se le aplican a `anon`, que tiene
-- SELECT sobre las 11 tablas: para esas seis, RLS es la única barrera. ALTER
-- POLICY respeta los roles y no los toca.
--
-- No lleva BEGIN/COMMIT explícito: el runner de Supabase ya envuelve cada
-- archivo en una transacción, y 819 de las 821 migraciones de este repo
-- dependen de eso. Meter un COMMIT a mano cerraría la transacción de afuera.
--
-- ── LO QUE MEJORÓ, MEDIDO ──────────────────────────────────────────────────
-- Misma consulta, misma persona, forma vieja contra forma nueva, con
-- EXPLAIN (analyze, buffers). Se miran los BUFFERS, no los milisegundos: en una
-- instancia con CPU compartida el tiempo miente, las lecturas no.
--
--                                buffers        tiempo
--   segmentos de tiempo     41789 →   513    2242 ms → 3,1 ms   (81x menos)
--   llamados (supervisora)   5476 →  2770    32,6 ms → 10,3 ms  (2x menos)
--   notificaciones (campana)  724 →   724    2,79 ms → 1,62 ms  (igual)
--
-- Los tres casos son distintos a propósito:
--  · Segmentos de tiempo es el caso tipo LeadGen. `has_role(auth.uid(),'admin')`
--    corría 10.451 veces; ahora corre UNA. Para Carolina, que no es admin, eso
--    era 41.789 lecturas para devolver 131 filas.
--  · Llamados baja a la mitad: la rama de supervisora ahora es un InitPlan casi
--    gratis y el planificador la resuelve antes, así que para un supervisor la
--    rama de host (tipo B) ya casi no llega a evaluarse.
--  · La campana no baja lecturas porque ya tenía índice (#1871): lo que se
--    ahorra ahí es solo el parseo del JSON, y aun así es 1,7x.
--
-- ── COMPROBACIÓN, antes y después ──────────────────────────────────────────
--
-- Filas visibles simulando CINCO personas reales más `anon`, elegidas para que
-- cada rama de cada política quede ejercida por alguien
-- (`set_config('request.jwt.claims',…)` + `set local role authenticated`, o sea
-- RLS de verdad, no el plan). Los conteos van acotados a lo creado ANTES del
-- 18/09 para que el equipo pueda seguir trabajando sin mover los números entre
-- la medición de antes y la de después.
--
--                          Álvaro  Carolina  Isabel   Paul   Andrés  anon
--                          admin   supervi-  host NO  parti-  fuera
--                          + host  sora      supervi  cipante de todo
--   notificaciones          1662     5000*     244     795       5      0
--   pausas                   818      818       10      29       0      0
--   pedidos de anfitrión     697       10        1      85       0      0
--   llamados                 888      888       13      38       0      0
--   membresías               192       63       68     125       0      0
--   asignaciones            1392       53       55      40       0      0
--   salas                     70        0        2       3       0      0
--   pedidos de pantalla        0        0        0       0       0      0
--   sesiones                  12        3        4       6       0      0
--   segmentos de tiempo    10206      131      141     139       0      0
--
--   Las 60 casillas dieron EXACTAMENTE lo mismo después de aplicar.
--   (*) Carolina llega al tope de 5000 filas que devuelve la consola; es un
--       tope de la herramienta, no de la política. Lo que importa es que sea
--       idéntico antes y después, y lo fue.
--
-- POR QUÉ ESTAS CINCO. Con una muestra de Álvaro + dos participantes había tres
-- ramas que NADIE ejercía, y una línea base que no puede fallar no comprueba
-- nada:
--
--  · Álvaro es admin, así que `is_in_role_group(...,'supervisor_or_above')` ya
--    le devuelve la tabla entera y la rama de HOST no aportaba ni una fila. Sus
--    818 pausas y sus 888 llamados SON el total de esas tablas.
--    → Isabel Tuirán es la ÚNICA persona de la empresa que es host sin ser
--      supervisora. Sus 10 pausas y 13 llamados son más que lo propio y mucho
--      menos que el total: es el único número que prueba `is_cowork_host`.
--  · `has_role(...,'admin')` en segmentos de tiempo tampoco se distinguía: el
--    10206 de Álvaro es el total de la tabla.
--    → Carolina Jaramillo es supervisora y NO admin: ve las 818 pausas y los
--      888 llamados, pero en segmentos ve 131, lo suyo. Si viera 10206, la rama
--      de admin se estaría fugando.
--  · No había NADIE realmente afuera: todos los participantes de la muestra
--    tenían membresías.
--    → Andrés Paredes, sin rol de supervisor y sin ninguna membresía: 0 en las
--      nueve tablas de Cowork y solo sus 5 notificaciones.
--  · `anon` no se había probado nunca, y es el único caso donde un error sale a
--    internet. Da 0 en las 11 tablas, antes y después.
--
-- LO QUE UN CONTEO NO PUEDE VER, y cómo se comprobó igual:
--
--  · La rama `user_has_role_name(uid, role_target)` de notificaciones no tiene
--    NI UNA fila con la que ejercerse: `role_target` es NULL en las 109.522
--    filas de la tabla. Se comparó la expresión vieja contra la nueva sobre
--    filas sintéticas (VALUES), sin escribir nada: con el JWT de Paul (Chatter)
--    da true para 'Chatter' y NULL para 'Warming'/'admin'; con el de Daniel
--    Duque (Warming) es al revés. Vieja y nueva coinciden fila por fila.
--  · Las 6 políticas de escritura (2 INSERT, 3 UPDATE, 1 DELETE) no las toca un
--    SELECT, y su modo de fallo es MUDO: si RLS filtra todo, PostgREST devuelve
--    0 filas afectadas sin error y la campana simplemente no se apaga nunca.
--    Las de notificaciones llevan la MISMA expresión que su SELECT (están una
--    al lado de la otra acá abajo), así que el conteo de arriba las cubre. Las
--    otras se midieron por su predicado, sin escribir, y no se movieron:
--       Álvaro → 11 sesiones que puede actualizar, 12 en las que puede pedir,
--                limites=true, supervisor=true, has_role(admin)=true
--       Paul   → 0 sesiones que puede actualizar, 6 en las que puede pedir,
--                limites=false, supervisor=false, has_role(admin)=false
--  · Pedidos de pantalla da 0 para todos porque la tabla tiene 4 filas en
--    total. Esas 3 políticas quedan SIN comprobar por conteo; se dice acá en
--    vez de dejar un 0 que parece una comprobación y no lo es.
--  · Siete de las once tablas están publicadas en Realtime (notificaciones,
--    sesiones, salas, membresías, asignaciones, pedidos de anfitrión y de
--    pantalla). Ahí la política de SELECT se re-evalúa por suscriptor y por fila
--    cambiada — es justo el patrón que tumbó la base el 17/09, y es donde más
--    va a rendir esto. Pero también significa que un error se ve como "el
--    tablero va lento", no como un error: useCoworkSession vuelve a leer todo
--    cada 60 s por las dudas. Si tras aplicar esto el tablero solo se actualiza
--    al minuto y no al instante, la culpa es de acá.
--
-- Para revertir: quitarle el (SELECT ...) a cada expresión, dejándolas como
-- estaban. Están todas acá abajo con su forma original en el comentario.

-- ── NOTIFICACIONES ─────────────────────────────────────────────────────────
-- original: (auth.uid() = user_id)
ALTER POLICY "Users can delete own notifications" ON public.notifications
  USING ((SELECT auth.uid()) = user_id);

-- original: (auth.uid() = user_id) OR ((user_id IS NULL) AND (role_target IS NOT NULL)
--            AND user_has_role_name(auth.uid(), role_target))
-- user_has_role_name mira `role_target` de la fila → tipo (B).
ALTER POLICY "Users can view own or role-targeted notifications" ON public.notifications
  USING (
    ((SELECT auth.uid()) = user_id)
    OR ((user_id IS NULL) AND (role_target IS NOT NULL)
        AND public.user_has_role_name((SELECT auth.uid()), role_target))
  );

-- Misma expresión que la de SELECT, a propósito: por eso el conteo de arriba
-- también vale como comprobación de esta.
ALTER POLICY "Users can update own notifications" ON public.notifications
  USING (
    ((SELECT auth.uid()) = user_id)
    OR ((user_id IS NULL) AND (role_target IS NOT NULL)
        AND public.user_has_role_name((SELECT auth.uid()), role_target))
  );

-- ── COWORK ─────────────────────────────────────────────────────────────────

-- original USING y CHECK: is_in_role_group(auth.uid(), 'admin') → tipo (A)
ALTER POLICY "Admins cambian los limites" ON public.cowork_break_limits
  USING ((SELECT public.is_in_role_group((SELECT auth.uid()), 'admin'::text)))
  WITH CHECK ((SELECT public.is_in_role_group((SELECT auth.uid()), 'admin'::text)));

-- original: is_cowork_host(auth.uid(), session_id) → tipo (B)
ALTER POLICY "Hosts see breaks of their session" ON public.cowork_breaks
  USING (public.is_cowork_host((SELECT auth.uid()), session_id));

-- original: (user_id = auth.uid())
ALTER POLICY "Own breaks" ON public.cowork_breaks
  USING (user_id = (SELECT auth.uid()));

-- original: is_in_role_group(auth.uid(), 'supervisor_or_above') → tipo (A)
ALTER POLICY "Supervisors see all breaks" ON public.cowork_breaks
  USING ((SELECT public.is_in_role_group((SELECT auth.uid()), 'supervisor_or_above'::text)));

-- original CHECK: (is_cowork_member(auth.uid(), session_id) AND (user_id = auth.uid()))
ALTER POLICY "Members can create host requests" ON public.cowork_host_requests
  WITH CHECK (public.is_cowork_member((SELECT auth.uid()), session_id)
              AND (user_id = (SELECT auth.uid())));

ALTER POLICY "Hosts see all host requests" ON public.cowork_host_requests
  USING (public.is_cowork_host((SELECT auth.uid()), session_id));

ALTER POLICY "Users see own host requests" ON public.cowork_host_requests
  USING (user_id = (SELECT auth.uid()));

-- ⚠️ Las tres siguientes están concedidas a {public}, no a {authenticated}.
ALTER POLICY "Anfitriones ven los de su sesion" ON public.cowork_llamados
  USING (public.is_cowork_host((SELECT auth.uid()), session_id));

ALTER POLICY "Propios llamados" ON public.cowork_llamados
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "Supervisores ven todos" ON public.cowork_llamados
  USING ((SELECT public.is_in_role_group((SELECT auth.uid()), 'supervisor_or_above'::text)));

ALTER POLICY "Members see session memberships" ON public.cowork_memberships
  USING (public.is_cowork_member((SELECT auth.uid()), session_id));

ALTER POLICY "Hosts see all assignments" ON public.cowork_room_assignments
  USING (public.is_cowork_host((SELECT auth.uid()), session_id));

ALTER POLICY "Participants see own assignment" ON public.cowork_room_assignments
  USING (user_id = (SELECT auth.uid()));

ALTER POLICY "Hosts see all rooms" ON public.cowork_rooms
  USING (public.is_cowork_host((SELECT auth.uid()), session_id));

-- original: (id = get_cowork_user_room(auth.uid(), session_id)) → tipo (B)
ALTER POLICY "Participants see their assigned room" ON public.cowork_rooms
  USING (id = public.get_cowork_user_room((SELECT auth.uid()), session_id));

ALTER POLICY "Members can create screenshare requests" ON public.cowork_screenshare_requests
  WITH CHECK (public.is_cowork_member((SELECT auth.uid()), session_id)
              AND (user_id = (SELECT auth.uid())));

ALTER POLICY "Hosts see all screenshare requests" ON public.cowork_screenshare_requests
  USING (public.is_cowork_host((SELECT auth.uid()), session_id));

ALTER POLICY "Users see own screenshare requests" ON public.cowork_screenshare_requests
  USING (user_id = (SELECT auth.uid()));

-- original: is_cowork_member(auth.uid(), id) — ojo, acá la columna es `id`
ALTER POLICY "Members can view their session" ON public.cowork_sessions
  USING (public.is_cowork_member((SELECT auth.uid()), id));

ALTER POLICY "Hosts can update session" ON public.cowork_sessions
  USING (public.is_cowork_host((SELECT auth.uid()), id));

-- original: ((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::text))
-- El segundo lado no mira la fila → tipo (A) dentro de un OR.
-- ⚠️ has_role está sobrecargada: has_role(uuid,text) y has_role(uuid,app_role).
-- El ::text explícito es el que elige la misma que hoy; no sacarlo.
ALTER POLICY "tiempo: cada uno lo suyo" ON public.cowork_tiempo_segmentos
  USING ((user_id = (SELECT auth.uid()))
         OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::text)));
