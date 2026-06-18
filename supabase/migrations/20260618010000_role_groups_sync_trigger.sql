-- Bug sistémico: crear un rol desde la UI (INSERT en roles_config) NUNCA creaba
-- la fila correspondiente en role_groups. Como public.is_in_role_group() hace
-- INNER JOIN user_roles.role = role_groups.role_name, todo rol sin fila en
-- role_groups nacía SIN capacidades de RLS (acceso 0 a inbox/closers/bots/etc.),
-- aunque tuviera permisos de menú en role_permissions. Además, renombrar un rol
-- no propagaba el cambio a role_groups ni a user_roles → huérfana capacidades y
-- asignaciones.
--
-- Red de seguridad a nivel DB: un trigger en roles_config que GARANTIZA que la
-- fila de role_groups exista (default: miembro) y que renombrar no rompa nada.
-- El frontend setea el NIVEL real (member/supervisor/manager/admin) vía upsert;
-- este trigger es el piso que asegura el invariante para cualquier vía de
-- creación (UI, SQL, seeds).

-- 1) Backfill: toda fila de roles_config debe tener su par en role_groups
--    (hoy falta "Chatter"). Default miembro; el admin sube el nivel desde la UI.
INSERT INTO public.role_groups (role_name, is_member, description)
SELECT rc.name, true, rc.description
FROM public.roles_config rc
WHERE NOT EXISTS (SELECT 1 FROM public.role_groups rg WHERE rg.role_name = rc.name)
ON CONFLICT (role_name) DO NOTHING;

-- 2) Trigger function. SECURITY DEFINER: necesita escribir user_roles, que tiene
--    RLS sin policy de INSERT/UPDATE (las escrituras normales van por service_role).
CREATE OR REPLACE FUNCTION public.tg_roles_config_sync_role_groups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Rol nuevo → garantiza capacidades (default: miembro). El frontend luego
    -- hace upsert con el nivel elegido.
    INSERT INTO public.role_groups (role_name, is_member, description)
    VALUES (NEW.name, true, NEW.description)
    ON CONFLICT (role_name) DO NOTHING;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.name IS DISTINCT FROM OLD.name THEN
    -- Renombre: capacidades (role_groups) y asignaciones (user_roles) van por
    -- NOMBRE. Orden: crear el destino (preservando flags) ANTES de mover
    -- user_roles, para no disparar el WARNING de "rol sin role_group".
    INSERT INTO public.role_groups
      (role_name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member, description, created_at, updated_at)
    SELECT NEW.name, is_admin, is_manager_or_above, is_supervisor_or_above, is_member, NEW.description, created_at, now()
    FROM public.role_groups WHERE role_name = OLD.name
    ON CONFLICT (role_name) DO NOTHING;

    UPDATE public.user_roles SET role = NEW.name WHERE role = OLD.name;

    DELETE FROM public.role_groups WHERE role_name = OLD.name;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Triggers.
DROP TRIGGER IF EXISTS trg_roles_config_sync_insert ON public.roles_config;
CREATE TRIGGER trg_roles_config_sync_insert
  AFTER INSERT ON public.roles_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_roles_config_sync_role_groups();

DROP TRIGGER IF EXISTS trg_roles_config_sync_rename ON public.roles_config;
CREATE TRIGGER trg_roles_config_sync_rename
  AFTER UPDATE OF name ON public.roles_config
  FOR EACH ROW EXECUTE FUNCTION public.tg_roles_config_sync_role_groups();
