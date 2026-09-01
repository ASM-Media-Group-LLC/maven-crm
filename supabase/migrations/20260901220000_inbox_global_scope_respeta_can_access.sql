-- El scope global de las bandejas WA/TG ahora respeta can_access=false.
--
-- EL BUG (reporte de Andrea Palacio, HHRR, 01/09/2026): le llegaban
-- notificaciones de conversaciones de WhatsApp/Telegram de tabs que ni ve.
-- Su rol HHRR está en el grupo supervisor_or_above, y has_*_inbox_global_scope
-- daba scope global a cualquier supervisor que no tuviera data_scope='self' —
-- IGNORANDO que el rol tiene el módulo APAGADO (can_access=false a nivel
-- módulo). La UI escondía el tab, pero la RLS la dejaba ver todo, y el hook
-- global de notificaciones (montado para todos) le avisaba cada entrante.
-- El "data_scope decorativo" de la auditoría de permisos, mordiendo de nuevo.
--
-- LA REGLA NUEVA: un rol con el módulo explícitamente apagado NO tiene scope
-- global, tenga el tier que tenga (admins quedan exentos, como siempre).
-- Sin fila para el módulo se mantiene el default de siempre (supervisor+ ve).
-- Misma semántica multi-rol que la regla 'self' existente: cualquier rol del
-- usuario con el módulo apagado alcanza para negar.

CREATE OR REPLACE FUNCTION public.has_wa_inbox_global_scope(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR (
      public.is_in_role_group(_user_id, 'supervisor_or_above')
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'WhatsApp'
          AND rp.submodule IS NULL
          AND rp.data_scope = 'self'
      )
      -- Módulo APAGADO por rol → sin scope global (el fix).
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'WhatsApp'
          AND rp.submodule IS NULL
          AND rp.can_access = false
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.has_tg_inbox_global_scope(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_in_role_group(_user_id, 'admin')
    OR (
      public.is_in_role_group(_user_id, 'supervisor_or_above')
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'Telegram'
          AND rp.submodule IS NULL
          AND rp.data_scope = 'self'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles_config rc ON rc.name = ur.role
        JOIN public.role_permissions rp ON rp.role_id = rc.id
        WHERE ur.user_id = _user_id
          AND rp.module = 'Telegram'
          AND rp.submodule IS NULL
          AND rp.can_access = false
      )
    );
$function$;
