-- Promobot: subtab nuevo de Promolog (control del pipeline). Lo agregamos al
-- sistema de permisos como submodule de "Promolog", DEFAULT SOLO ADMIN.
--
-- Por qué sembrar filas explícitas en vez de confiar en el default:
-- usePermissions.canAccess hace que un submodule SIN fila propia HEREDE el
-- acceso del módulo. Si no sembramos nada, cualquier rol con acceso a Promolog
-- vería Promobot por defecto. Para que sea "solo admin por defecto" insertamos
-- can_access=false para cada rol NO-admin. Los admin tienen acceso vía isAdmin
-- (no necesitan fila). Desde Settings/admin/roles se puede marcar por rol.
--
-- Idempotente: solo inserta si no existe ya una fila (role, Promolog, Promobot).
-- Mismas columnas que escribe la app (sin tenant_id, igual que savePermissions).

INSERT INTO public.role_permissions (role_id, module, submodule, can_access, data_scope)
SELECT rc.id, 'Promolog', 'Promobot', false, 'all'
FROM public.roles_config rc
WHERE lower(rc.name) <> 'admin'
  AND NOT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    WHERE rp.role_id = rc.id
      AND rp.module = 'Promolog'
      AND rp.submodule = 'Promobot'
  );
