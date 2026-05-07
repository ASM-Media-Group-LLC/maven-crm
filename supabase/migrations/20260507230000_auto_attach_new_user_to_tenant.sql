-- Fix de raíz: cada user nuevo creado en auth.users entra automáticamente
-- al tenant default (ASM Tech mientras seamos single-tenant). Sin esto,
-- los nuevos usuarios quedan tenant-less, current_tenant_id() devuelve
-- NULL, y TODAS las RLS basadas en tenant los esconden TODO — el síntoma
-- es "creé un usuario y ve la app vacía".
--
-- Histórico: la migration original (20260504200000_tenants_and_membership)
-- explícitamente dejó este flow para "el futuro onboarding flow" que
-- nunca se construyó. Cada vez que apareció un user roto lo arreglamos
-- a mano. Esta migration cierra el hueco.
--
-- Cuando llegue multi-tenant real, este trigger evoluciona:
--   - Lee `raw_user_meta_data.tenant_slug` del invite
--   - O resuelve por dominio del email (jhon@unlok.me → unlok)
--   - O crea un tenant nuevo si el invite es como "owner"
-- Por ahora, single-tenant: todo el mundo va a ASM Tech.

-- Reemplazamos handle_new_user() preservando lo que ya hace (profiles,
-- user_roles) y agregando el INSERT en tenant_members.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_tenant_id uuid;
BEGIN
  -- 1. Profile (compat con flow original)
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  -- 2. User role (compat con flow original)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT DO NOTHING;

  -- 3. Tenant membership — single-tenant default a ASM Tech.
  -- Si ASM Tech no existe (instalación nueva sin seed), dejamos
  -- el INSERT silencioso. Multi-tenant: cambiar la lógica acá.
  SELECT id INTO default_tenant_id
  FROM public.tenants
  WHERE slug = 'asm-tech' AND active = true
  LIMIT 1;

  IF default_tenant_id IS NOT NULL THEN
    INSERT INTO public.tenant_members (user_id, tenant_id, role)
    VALUES (NEW.id, default_tenant_id, 'member')
    ON CONFLICT (user_id, tenant_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: cualquier user que ya existe en auth.users pero NO en
-- tenant_members → meterlo a ASM Tech como member. Idempotente.
INSERT INTO public.tenant_members (user_id, tenant_id, role)
SELECT u.id, t.id, 'member'
FROM auth.users u
CROSS JOIN public.tenants t
WHERE t.slug = 'asm-tech'
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = u.id AND tm.tenant_id = t.id
  );

-- El trigger ya está creado en la migration original; la función
-- nueva con el mismo nombre ya quedó sustituida arriba.
