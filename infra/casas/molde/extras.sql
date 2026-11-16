-- MOLDE DE LA CASA · EXTRAS (tren de agencias, vagón 1 — 15/11/2026)
--
-- Lo que el volcado del esquema `public` (esquema.sql) NO trae porque vive en
-- esquemas de Supabase (storage, auth, realtime). Sacado de producción el
-- 15/11/2026 con consultas de solo lectura. Se aplica DESPUÉS de esquema.sql en
-- una casa nueva (vacía). Nunca se corre contra la base de Kash.

-- ─── 1. Los baldes de archivos (vacíos) ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('absence-documents', 'absence-documents', true, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('announcement-files', 'announcement-files', true, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('anuncios-voz', 'anuncios-voz', true, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('argos-clips', 'argos-clips', false, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('chat-files', 'chat-files', true, 1073741824, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('chatter-vault', 'chatter-vault', true, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('closer-evidence', 'closer-evidence', false, 5242880, '{image/png,image/jpeg,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('company-logos', 'company-logos', true, 500000, '{image/png,image/svg+xml,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('creator-avatars', 'creator-avatars', true, 5242880, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('creator-files', 'creator-files', false, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('custom-request-attachments', 'custom-request-attachments', true, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('custom-requests', 'custom-requests', false, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('drive-aportes', 'drive-aportes', false, 10737418240, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('monitor-capturas', 'monitor-capturas', false, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('parrilla-pdfs', 'parrilla-pdfs', true, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('promolog-evidence', 'promolog-evidence', false, 5242880, '{image/png,image/jpeg,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('qa-audio', 'qa-audio', false, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('scouter-avatars', 'scouter-avatars', true, 500000, '{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('scouter-screenshots', 'scouter-screenshots', false, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('task-files', 'task-files', false, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('template-logos', 'template-logos', true, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('tg-media', 'tg-media', true, 367001600, null) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('user-avatars', 'user-avatars', true, 5242880, '{image/png,image/jpeg,image/webp,image/gif,image/avif}'::text[]) on conflict (id) do nothing;

-- ─── 2. Los disparadores de las cuentas (auth.users) ────────────────────────
CREATE TRIGGER cuenta_externa_sin_rol AFTER UPDATE OF raw_app_meta_data ON auth.users FOR EACH ROW WHEN ((((new.raw_app_meta_data ->> 'tipo'::text) = 'creadora'::text) AND ((old.raw_app_meta_data ->> 'tipo'::text) IS DISTINCT FROM 'creadora'::text))) EXECUTE FUNCTION cuenta_externa_sin_rol();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── 3. Quién puede leer y subir cada archivo (storage.objects) ─────────────
create policy "Admins can delete creator-files" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'creator-files'::text) AND has_role(auth.uid(), 'admin'::app_role)));
create policy "Anyone can read announcement files" on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'announcement-files'::text));
create policy "Anyone can view absence documents" on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'absence-documents'::text));
create policy "Anyone can view template logos" on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'template-logos'::text));
create policy "Authenticated can update template logos" on storage.objects as PERMISSIVE for UPDATE to authenticated using ((bucket_id = 'template-logos'::text));
create policy "Authenticated can upload template logos" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'template-logos'::text));
create policy "Authenticated users can delete announcement files" on storage.objects as PERMISSIVE for DELETE to authenticated using ((bucket_id = 'announcement-files'::text));
create policy "Authenticated users can delete own attachments" on storage.objects as PERMISSIVE for DELETE to authenticated using ((bucket_id = 'custom-request-attachments'::text));
create policy "Authenticated users can read creator-files" on storage.objects as PERMISSIVE for SELECT to authenticated using ((bucket_id = 'creator-files'::text));
create policy "Authenticated users can read task files" on storage.objects as PERMISSIVE for SELECT to authenticated using ((bucket_id = 'task-files'::text));
create policy "Authenticated users can update creator-files" on storage.objects as PERMISSIVE for UPDATE to authenticated using ((bucket_id = 'creator-files'::text));
create policy "Authenticated users can upload absence documents" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'absence-documents'::text));
create policy "Authenticated users can upload announcement files" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'announcement-files'::text));
create policy "Authenticated users can upload attachments" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'custom-request-attachments'::text));
create policy "Authenticated users can upload chat files" on storage.objects as PERMISSIVE for INSERT to public with check (((bucket_id = 'chat-files'::text) AND (auth.role() = 'authenticated'::text)));
create policy "Authenticated users can upload creator-files" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'creator-files'::text));
create policy "Authenticated users can upload task files" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'task-files'::text));
create policy "Authenticated users can view attachments" on storage.objects as PERMISSIVE for SELECT to authenticated using ((bucket_id = 'custom-request-attachments'::text));
create policy "Chat files accessible to authenticated" on storage.objects as PERMISSIVE for SELECT to authenticated using ((bucket_id = 'chat-files'::text));
create policy "Users can delete their own chat files" on storage.objects as PERMISSIVE for DELETE to public using (((bucket_id = 'chat-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy "Users can delete their own task files" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'task-files'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));
create policy "aportar anon insert" on storage.objects as PERMISSIVE for INSERT to anon with check ((bucket_id = 'drive-aportes'::text));
create policy "aportar anon update" on storage.objects as PERMISSIVE for UPDATE to anon using ((bucket_id = 'drive-aportes'::text)) with check ((bucket_id = 'drive-aportes'::text));
create policy "chatter-vault delete auth" on storage.objects as PERMISSIVE for DELETE to authenticated using ((bucket_id = 'chatter-vault'::text));
create policy "chatter-vault insert auth" on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'chatter-vault'::text));
create policy "chatter-vault read public" on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'chatter-vault'::text));
create policy "chatter-vault update auth" on storage.objects as PERMISSIVE for UPDATE to authenticated using ((bucket_id = 'chatter-vault'::text)) with check ((bucket_id = 'chatter-vault'::text));
create policy "closer-evidence propias: borrar" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'closer-evidence'::text) AND ((owner = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))));
create policy "closer-evidence propias: leer" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'closer-evidence'::text) AND can_access_closer_lead((storage.foldername(name))[1])));
create policy "closer-evidence propias: subir" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'closer-evidence'::text) AND can_access_closer_lead((storage.foldername(name))[1])));
create policy "custom-requests delete" on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'custom-requests'::text) AND (EXISTS ( SELECT 1
   FROM custom_requests r
  WHERE (r.id = custom_request_de_ruta(objects.name)))) AND ((owner = ( SELECT auth.uid() AS uid)) OR can_use_module_function(( SELECT auth.uid() AS uid), 'Personalizados'::text, 'Gestionar'::text, 'supervisor_or_above'::text))));
create policy "custom-requests insert" on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'custom-requests'::text) AND custom_request_puede_editar(custom_request_de_ruta(name))));
create policy "custom-requests read" on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'custom-requests'::text) AND (EXISTS ( SELECT 1
   FROM custom_requests r
  WHERE (r.id = custom_request_de_ruta(objects.name))))));
create policy anuncios_voz_read on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'anuncios-voz'::text));
create policy argos_clips_obj_ins on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'argos-clips'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy argos_clips_obj_sel on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'argos-clips'::text) AND (es_dueno(( SELECT auth.uid() AS uid)) OR puede_vigilar_carpeta((storage.foldername(name))[1]))));
create policy company_logos_auth_write on storage.objects as PERMISSIVE for ALL to authenticated using ((bucket_id = 'company-logos'::text)) with check ((bucket_id = 'company-logos'::text));
create policy company_logos_public_read on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'company-logos'::text));
create policy creator_avatars_escriben_quienes_editan_creadoras on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'creator-avatars'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_creators_global_scope(auth.uid()) OR is_in_role_group(auth.uid(), 'supervisor_or_above'::text))));
create policy creator_avatars_lectura_publica on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'creator-avatars'::text));
create policy creator_avatars_reemplazan_quienes_editan_creadoras on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'creator-avatars'::text) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_creators_global_scope(auth.uid()) OR is_in_role_group(auth.uid(), 'supervisor_or_above'::text))));
create policy monitor_capturas_read_supervisor on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'monitor-capturas'::text) AND (es_dueno(( SELECT auth.uid() AS uid)) OR puede_vigilar_carpeta((storage.foldername(name))[1]))));
create policy monitor_capturas_upload_propio on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'monitor-capturas'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy qa_audio_tenant_isolated on storage.objects as PERMISSIVE for ALL to authenticated using (((bucket_id = 'qa-audio'::text) AND ((storage.foldername(name))[1] = (current_tenant_id())::text))) with check (((bucket_id = 'qa-audio'::text) AND ((storage.foldername(name))[1] = (current_tenant_id())::text)));
create policy scouter_avatars_public_read on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'scouter-avatars'::text));
create policy scouter_avatars_service_write on storage.objects as PERMISSIVE for ALL to authenticated, service_role using ((bucket_id = 'scouter-avatars'::text)) with check ((bucket_id = 'scouter-avatars'::text));
create policy scouter_screenshots_read on storage.objects as PERMISSIVE for SELECT to authenticated using (((bucket_id = 'scouter-screenshots'::text) AND (((storage.foldername(name))[2] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM user_roles ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role = ANY (ARRAY['admin'::text, 'manager'::text, 'supervisor'::text]))))))));
create policy scouter_screenshots_upload on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'scouter-screenshots'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy tg_media_auth_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check ((bucket_id = 'tg-media'::text));
create policy user_avatars_borro_lo_mio on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'user-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy user_avatars_escribo_lo_mio on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'user-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy user_avatars_lectura_publica on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'user-avatars'::text));
create policy user_avatars_reemplazo_lo_mio on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'user-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- ─── 4. Las tablas que avisan en vivo (realtime) ────────────────────────────
-- El molde a veces ya trae algunas: se agrega solo la que falta.
do $$
declare t text;
begin
  foreach t in array array['calls', 'chat_conversations', 'chat_join_requests', 'chat_messages', 'chat_participants', 'chatter_messages', 'chatter_sessions', 'cowork_avisos', 'cowork_host_requests', 'cowork_meet_participants', 'cowork_meets', 'cowork_memberships', 'cowork_room_assignments', 'cowork_rooms', 'cowork_screenshare_requests', 'cowork_sessions', 'drive_nas_salud', 'mail_messages', 'meet_guest_requests', 'model_phones', 'models', 'monitor_capturas', 'monitor_eventos', 'notifications', 'tg_conversations', 'tg_messages', 'wa_conversation_messages', 'wa_conversations'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
