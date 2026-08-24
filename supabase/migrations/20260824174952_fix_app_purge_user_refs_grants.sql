-- SEGURIDAD (24/08) — YA APLICADA EN PROD POR MCP.
-- public.app_purge_user_refs(uuid) es SECURITY DEFINER y había quedado con EXECUTE
-- para PUBLIC/anon/authenticated (drift: un DROP+CREATE posterior reseteó los grants
-- que la migración 20260506200000 ya revocaba en sus líneas 54-55).
-- Al vivir en `public` y ser VOLATILE, PostgREST la exponía como
-- POST /rest/v1/rpc/app_purge_user_refs, invocable con la anon key —que viaja en el
-- bundle del frontend— incluso SIN sesión.
-- Impacto: recorre las FKs a auth.users y hace DELETE en las columnas NOT NULL
-- (user_roles.user_id lo es) + DELETE FROM public.profiles. Cualquiera podía dejar
-- sin rol y sin perfil a cualquier usuario, incluidos los 8 admins.
-- Único llamador legítimo: admin-user-actions/index.ts (service_role).
REVOKE ALL ON FUNCTION public.app_purge_user_refs(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_purge_user_refs(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.app_purge_user_refs(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_purge_user_refs(uuid) TO service_role;
