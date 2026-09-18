-- Las reglas de perfiles y roles se evaluaban FILA POR FILA, y en las dos tablas
-- que Maven lee en CADA arranque de sesión y en CADA control de permisos.
--
-- 18/09/2026, siguiendo el hilo del incidente. Mismo patrón que se arregló en
-- leadgen (6.357 ms → 11 ms): una función suelta dentro de una política no sale
-- sola del bucle, aunque sea STABLE y su argumento no dependa de la fila. Acá
-- pesa por otro motivo: son pocas filas pero MUCHÍSIMAS consultas.
--
-- `has_role` no es barata. Por dentro consulta user_roles y puede llamar además
-- a is_in_role_group. Medido: UNA sola llamada cuesta 344 bloques.
--
-- ── PERFILES: SE BORRAN DOS POLÍTICAS Y NO CAMBIA QUIÉN VE QUÉ ──────────────
--
-- `profiles` tenía TRES políticas permisivas de SELECT para el mismo rol:
--    1. "Authenticated users can view all profiles"  →  USING (true)
--    2. "Admins can view all profiles"               →  has_role(auth.uid(),'admin')
--    3. "Users can view own profile"                 →  auth.uid() = id
--
-- Postgres une las permisivas con OR y las evalúa TODAS, sin cortar. Como la
-- primera es `true`, el resultado YA era `true` para todo el mundo: las otras
-- dos no podían agregar ni una fila. Eran trabajo puro, y una metía una consulta
-- a la base por cada fila.
--
-- Por eso se borran en vez de envolverlas: envolver una política que no puede
-- cambiar el resultado sigue siendo trabajo al vicio. El plan quedó sin filtro:
--   Seq Scan on profiles  ·  Buffers: shared hit=2  ·  Execution Time: 0.035 ms
--
-- ⚠️ SI ALGÚN DÍA SE ENDURECE `profiles` —hoy deja ver todos los perfiles a
-- cualquiera con cuenta, razonable en una herramienta interna donde hacen falta
-- nombres y fotos en todas partes— hay que volver a crear estas dos, ya envueltas:
--    CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT
--      TO authenticated USING ((select public.has_role((select auth.uid()), 'admin'::app_role)));
--    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT
--      TO authenticated USING ((select auth.uid()) = id);
--
-- ── ROLES: NO SE BORRA NADA, SOLO SE ENVUELVE ──────────────────────────────
--
-- En `user_roles` ninguna de las dos es `true`, así que las dos deciden de
-- verdad: un administrador ve los 68 y el resto ve solo el suyo. Se conservan y
-- se envuelven. Con (SELECT ...) cada una se resuelve UNA vez por consulta, así
-- que tener dos ya no cuesta. El plan quedó con InitPlan y 5 bloques.
--
-- Se usa ALTER POLICY en las que se conservan, para no poder cambiar por
-- accidente si son permisivas, a qué comando aplican ni a qué roles.
--
-- ── COMPROBACIÓN DE SEGURIDAD, antes y después ─────────────────────────────
--   Jhon (administrador): 70 perfiles, 68 roles          → igual
--   Daniel (sin rol):     70 perfiles,  1 rol, 0 ajenos  → igual
-- Y en la aplicación, el menú sigue dibujando los 26 módulos: si los roles se
-- hubieran roto, se habría quedado en los universales.
--
-- Para revertir:
--   CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT
--     TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
--   CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT
--     TO authenticated USING (auth.uid() = id);
--   ALTER POLICY "Users can insert own profile" ON public.profiles WITH CHECK (auth.uid() = id);
--   ALTER POLICY "Users can update own profile" ON public.profiles USING (auth.uid() = id);
--   ALTER POLICY "Admins can view all user roles" ON public.user_roles
--     USING (has_role(auth.uid(), 'admin'::app_role));
--   ALTER POLICY "Users can view own roles" ON public.user_roles USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

ALTER POLICY "Users can insert own profile" ON public.profiles
  WITH CHECK ((SELECT auth.uid()) = id);

ALTER POLICY "Users can update own profile" ON public.profiles
  USING ((SELECT auth.uid()) = id);

ALTER POLICY "Admins can view all user roles" ON public.user_roles
  USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)));

ALTER POLICY "Users can view own roles" ON public.user_roles
  USING (user_id = (SELECT auth.uid()));
