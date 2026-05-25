-- whatsapp_members ↔ auth.users link: constraints + RLS para admins.
--
-- La columna whatsapp_members.user_id ya existe con FK a auth.users
-- (ON DELETE SET NULL), pero no había:
--   - Un índice para que un mismo Maven user no quede linkeado a múltiples
--     wpp members del mismo grupo (sería ambiguo a la hora de cruzar
--     actividad: ¿cuál de los dos "Miguel" en el grupo es el que cargó
--     los leads?).
--   - Policies para que admins/managers puedan ACTUALIZAR el link via la
--     app (hoy solo service_role puede tocar la tabla porque solo había
--     policy SELECT por current_tenant_id()).
--
-- Side effect: cuando el cron whatsapp-ingest detecta un display_name
-- que matchea un profiles.full_name (por implementar a futuro), podría
-- auto-popular user_id. Hoy queda manual desde la UI.

-- 1. Índice único parcial — un Maven user solo puede estar linkeado a un
--    único wpp_member por grupo. Multi-grupo está OK (un user puede
--    estar en grupos de varios equipos).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_members_group_user_unique
  ON public.whatsapp_members (group_id, user_id)
  WHERE user_id IS NOT NULL;

-- 2. Index para acelerar el lookup inverso "dado un user_id, qué wpp
--    members tiene" — usado por el cron de verificación + por el tool
--    get_member_maven_activity del agent cuando recibe display_name.
CREATE INDEX IF NOT EXISTS whatsapp_members_user_id_idx
  ON public.whatsapp_members (user_id)
  WHERE user_id IS NOT NULL;

-- 3. UPDATE policy: admins y managers del tenant pueden actualizar el
--    link (user_id, role) de sus propios wpp_members. El resto de
--    columnas (display_name, last_seen_at, etc) las sigue tocando solo
--    service_role desde la edge function — RLS por defecto bloquea
--    UPDATE para roles no service.
--
--    Nota: esta policy permite UPDATE de CUALQUIER columna por estos
--    roles, no solo user_id/role. Si en el futuro queremos restringir
--    columnas, hay que pasar a triggers BEFORE UPDATE que reviertan
--    cambios fuera de la whitelist. Por ahora confiamos en la UI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.whatsapp_members'::regclass
      AND polname = 'whatsapp_members_admin_update'
  ) THEN
    CREATE POLICY whatsapp_members_admin_update
      ON public.whatsapp_members
      FOR UPDATE
      USING (
        tenant_id = current_tenant_id()
        AND EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role IN ('admin', 'manager')
        )
      )
      WITH CHECK (tenant_id = current_tenant_id());
  END IF;
END
$$;

-- 4. Comentarios para documentar la intención.
COMMENT ON COLUMN public.whatsapp_members.user_id IS
  'Link al usuario de Maven (auth.users.id == profiles.id). NULL = miembro detectado en el grupo pero todavía no mapeado por un admin. Usado por whatsapp-agent.get_member_maven_activity para cruzar actividad real (leads creados, contactos cargados, etc) con compromisos del grupo.';

COMMENT ON COLUMN public.whatsapp_members.role IS
  'Rol del miembro en el grupo según el equipo (no es el rol de Maven). Ej: "LLG", "closer", "supervisor". Free-form, usado solo para display en la UI.';
