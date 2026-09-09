-- wa_channels no miraba el data_scope, y por eso la UI mentia.
--
-- Sintoma: un rol con "Todos los datos" en WhatsApp (Operations Sales) veia UN solo canal
-- en Contactos, asi que el boton de WhatsApp no le ofrecia elegir linea. La policy solo
-- aceptaba dos cosas: pertenecer al grupo admin, o figurar en wa_channel_members. El
-- data_scope que se configura en la UI de permisos no lo leia nadie.
--
-- La inconsistencia era interna, no de criterio: wa_conversations y wa_conversation_messages
-- YA usan has_wa_inbox_global_scope(auth.uid()), o sea que estas mismas personas ya podian
-- leer TODAS las conversaciones. Lo unico que no veian eran los canales para elegir desde
-- cual escribir. Esto no abre datos nuevos: alinea el candado de los canales con el que las
-- conversaciones ya tenian.
--
-- Se reutiliza el helper que ya existe en vez de crear uno nuevo, justamente para que las
-- tres tablas no puedan volver a discrepar.
--
-- Alcance medido: has_wa_inbox_global_scope da true para 3 personas — Luis Carlos Ortega y
-- Test test (Operations Sales) y Brayan Castano (Team Leader). Para todos los demas da false.
-- Verificado despues de aplicar: Test test paso de 1 canal (Unlimited) a los 3; Carolina
-- (manager, data_scope 'self') sigue viendo 1, el suyo.
-- OJO: Brayan hoy esta en CERO canales y pasa a ver los 3, incluida la linea de Managers.
-- Si eso no se quiere, la salida limpia es bajarle el data_scope de WhatsApp a 'self'.
--
-- El chequeo equivalente va en supabase/functions/wa-inbox-open/index.ts: esta policy y ese
-- chequeo tienen que decir lo MISMO, o el selector ofrece canales que el back rechaza.

alter policy wa_channels_select on public.wa_channels
  using (
    (tenant_id = current_tenant_id())
    and (
      is_in_role_group(auth.uid(), 'admin'::text)
      or has_wa_inbox_global_scope(auth.uid())
      or exists (
        select 1 from public.wa_channel_members m
        where m.channel_id = wa_channels.id and m.user_id = auth.uid()
      )
    )
  );
