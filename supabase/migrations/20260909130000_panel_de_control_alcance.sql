-- Panel de control: cerrar sus dos tablas al modulo.
--
-- Estaban asi:
--   · api_usage_log (32.693 filas): policy api_usage_log_read con USING (true). Literalmente
--     sin condicion: cualquier persona logueada leia el log de uso y costo de todas las APIs.
--   · whatsapp_messages (12.391 filas): solo tenant, y ademas su permisiva era TO public
--     (incluye anon). anon hoy ve 0 porque current_tenant_id() le da NULL, pero eso es un
--     accidente afortunado, no un candado: se lo sacamos igual.
--
-- Con el modulo como quedo (Jhon se lo quito a Operations Sales), el Panel es de los 6 admin.
-- Nadie pierde pantalla: las 53 personas restantes no pueden abrir /panel-de-control, y
-- ControlGastoTab lee por la RPC api_usage_summary, no por la tabla.
--
-- whatsapp_messages NO es la bandeja de WhatsApp: la lee unicamente useWhatsappAgent, y a ese
-- hook solo lo usa panel-de-control/WhatsappAgentTab.tsx.
--
-- Nada de esto toca a los escritores:
--   · Los 12 edge functions de whatsapp-* usan adminClient() de _shared/whatsapp.ts, que es
--     SERVICE_ROLE_KEY sin fallback => bypassan RLS.
--   · _shared/usage.ts (quien inserta en api_usage_log) tambien usa service_role.
--   · La API publica de Maven (public-api) crea su cliente con SERVICE_ROLE_KEY! y ni siquiera
--     toca estas dos tablas.
--   · El gateway de Baileys no habla con Postgres: entra por las edge functions.
--
-- RESTRICTIVE y FOR ALL por lo mismo de siempre: las permisivas se suman con OR, y una
-- restrictiva de solo SELECT no se evalua en UPDATE. Verificado que ninguna pantalla inserta
-- en api_usage_log desde el navegador, asi que exigir el modulo en el WITH CHECK no rompe nada.

drop policy if exists api_usage_log_modulo on public.api_usage_log;
create policy api_usage_log_modulo
  on public.api_usage_log
  as restrictive
  for all
  to authenticated
  using      ((select public.has_permission(auth.uid(), 'Panel de control'::text, null::text)))
  with check ((select public.has_permission(auth.uid(), 'Panel de control'::text, null::text)));

-- Sacar a anon de la permisiva antes de poner la restrictiva: una restrictiva TO authenticated
-- no se evalua cuando el rol es anon, asi que el candado tiene que estar en la permisiva.
alter policy whatsapp_messages_tenant_select
  on public.whatsapp_messages to authenticated;

drop policy if exists whatsapp_messages_modulo on public.whatsapp_messages;
create policy whatsapp_messages_modulo
  on public.whatsapp_messages
  as restrictive
  for all
  to authenticated
  using      ((select public.has_permission(auth.uid(), 'Panel de control'::text, null::text)))
  with check ((select public.has_permission(auth.uid(), 'Panel de control'::text, null::text)));

-- api_usage_summary es SECURITY DEFINER y era ejecutable por anon SIN ningun control adentro:
-- devolvia el gasto agregado de APIs a cualquiera, sin sesion. Le queda authenticated para que
-- ControlGastoTab siga funcionando.
-- PENDIENTE (misma tanda que las 6 funciones de Promolog): cualquier empleado logueado la puede
-- seguir llamando. Cerrarla del todo pide un gate adentro de la funcion, no un revoke.
revoke execute on function public.api_usage_summary(timestamptz, timestamptz) from public, anon;
