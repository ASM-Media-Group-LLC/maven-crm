-- P0 (2026-06-26): las vistas enmascaradas del patrón PII son SECURITY DEFINER (corren como
-- su owner → saltan la RLS de la tabla base, que es justo lo que las hace funcionar con el
-- column-revoke). PERO Supabase tiene ALTER DEFAULT PRIVILEGES que concede SELECT a anon y
-- authenticated en CADA objeto nuevo del schema public → toda vista nueva quedó legible por
-- ANON (sin login). La RLS de las tablas base bloqueaba a anon, pero la vista definer la salta,
-- así que anon podía leer TODAS las filas (PII enmascarada, pero nombres/handles/notas/ciudad y
-- demás campos en claro). Exposición medida: v_closers_contacts=2582, v_creators=336,
-- v_super_contacts=2, v_agencies=2 (scouter/prospects=0 por filtro de tenant).
--
-- Fix: revocar SELECT a anon + public en TODAS las vistas del patrón. authenticated (la app,
-- siempre logueada) conserva acceso. REGLA a futuro: toda vista enmascarada nueva DEBE incluir
-- `revoke select on <vista> from anon, public;` (el grant explícito a authenticated NO alcanza
-- porque el default-privilege ya metió a anon).
do $$
declare v text;
begin
  foreach v in array array[
    'v_creators','v_closers_contacts','v_super_contacts','v_agencies','v_scouter_leads',
    'v_creator_prospects','v_model_phone_captures','v_promolog_eligible_creators','v_wa_contacts'
  ] loop
    if to_regclass('public.'||v) is not null then
      execute format('revoke select on public.%I from anon, public', v);
    end if;
  end loop;
end $$;
notify pgrst, 'reload schema';
