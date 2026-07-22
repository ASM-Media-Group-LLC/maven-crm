-- La policy UPDATE de creators era solo admin/manager → para un Closer
-- Supervisor (Miguel), guardar/publicar el wizard de Onboarding hacía un
-- UPDATE silenciosamente no-op (RLS en UPDATE no tira error: afecta 0 filas,
-- ver [[maven_data_rls_gotchas]]) → la creadora quedaba CLAVADA en 'borrador'
-- aunque completara el wizard (causa raíz #2 del caso sunhoney).
--
-- Se alinea con la policy de INSERT (#937): quien puede CREAR creadoras desde
-- el pipeline también puede actualizarlas (global scope o supervisor_or_above).

alter policy "Managers and admins can update creators" on public.creators
  using (
    has_role(auth.uid(), 'admin'::app_role)
    or has_role(auth.uid(), 'manager'::app_role)
    or has_creators_global_scope(auth.uid())
    or is_in_role_group(auth.uid(), 'supervisor_or_above')
  );
