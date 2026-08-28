-- Submodulo nuevo: Chatters → Rendimiento (el dashboard).
--
-- Se siembra a los roles que ya tienen Chatters → Admin, que es el permiso mas
-- restrictivo del modulo: quien administra el evaluador es quien mira el
-- rendimiento del equipo. Los demas roles quedan en falso y se prenden desde
-- Administracion → Roles como cualquier otro subtab.

INSERT INTO public.role_permissions (role_id, module, submodule, can_access)
SELECT rp.role_id, 'Chatters', 'Rendimiento', true
FROM public.role_permissions rp
WHERE rp.module = 'Chatters' AND rp.submodule = 'Admin' AND rp.can_access
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions x
    WHERE x.role_id = rp.role_id AND x.module = 'Chatters' AND x.submodule = 'Rendimiento'
  );
