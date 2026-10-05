-- ════════════════════════════════════════════════════════════════════════════
-- Volcado del catálogo de PROD (proyecto lsagslbkliprespbyhts) del 05/10/2026,
-- SIN DATOS: las creadoras y los avisos, para probar
-- 20261005140000_creadoras_por_agencia y 20261005140100_cuentas_externas_y_avisos
-- (supabase/tests/creadoras_por_agencia.ts). Se carga DESPUÉS de
-- fixtures/prod_roles_20261001.sql (roles, auth, tenants, profiles) y ANTES de
-- agencias_base, roles_por_agencia y personas_por_agencia (que ya están en prod).
-- Sacado con pg_get_functiondef, pg_get_viewdef, pg_get_constraintdef,
-- pg_get_indexdef, pg_get_triggerdef, pg_policies y los permisos de pg_class.
--
-- creators tiene sus 133 columnas, defaults, restricciones, índices, permisos
-- (SELECT de authenticated en 122 columnas, como en prod) y políticas de prod.
-- v_creators, v_promolog_eligible_creators y v_creator_prospects son las de prod,
-- con sus permisos (anon escribe sin leer; authenticated, todo). notifications
-- tiene sus columnas, políticas y triggers de prod.
-- Las funciones son copia textual; el banco recalcula md5(prosrc) de cada una y
-- lo compara con estas huellas: si alguna no coincide, falla. Si prod cambia, se
-- vuelve a sacar. Sus permisos de EXECUTE son los de prod (anon solo en
-- create_platform_deal_for_creator y create_ticket_from_form).
--
-- Huellas de prod, md5(prosrc):
--   blu_conciliacion(p_dias integer)=3e9d48e60396e3c0fee3dbcffc744bc8
--   chatter_can_view_creator(_uid uuid, _creator_id uuid)=e1e6c0c8d7a837dc166f4737303f961f
--   contact_filter_cities()=64a172710fe8486ce949c72e93239e7e
--   contact_ids_by_city(p_city text)=2c2b105f5e60fc0142c75186b2da642b
--   convert_contact_to_creator(p_contact_id uuid)=0ab366880c16c11383e666e4f78cba70
--   corte_cierre_prep(p_group_id uuid)=10366d2621b3839fb00b4c45c275b981
--   create_platform_deal_for_creator(p_creator_id uuid, p_platform text, p_subscription_amount numeric, p_closer_id uuid)=f3bc6175b12d838d43e123ba5ca846e8
--   create_recruitment_deal_for_creator(p_creator_id uuid, p_closer_id uuid, p_estimated_monetization numeric, p_agency_commission numeric)=bd86911a0d48455a6b6b27e22fb4f28c
--   create_ticket_from_form(p_form_id uuid, p_answers jsonb, p_creator_id uuid)=111c04e0f3cd7116d5312556a72edc9e
--   find_creator_history_by_handle(p_handle text)=b4b7573c8611fbc906404033a3978454
--   find_creator_name_by_email(p_email text)=3bdc2ad5a0869a9237dd9a63abae23c5
--   find_creator_name_by_phone(p_phone text)=e1150824c1c0fc9f7c8983a9dc67f525
--   get_contact_funnel_list(p_bucket text, p_from date, p_to date)=a0520c9560fd5a68cc13ce57ece5bdf7
--   get_contact_funnel_stats(p_from date, p_to date)=a04ee7de2ea45e686fcb3e41d179b17a
--   get_contact_history(p_contact_id uuid)=44b53de2c2e8493f3d496ee88ff607d3
--   get_contact_statuses()=a1d039fa2839badbe13691bea678bdd7
--   get_creator_scan_config(p_tenant uuid, p_query text)=6966d5dc9c9e987a8ce8c1023a0315f6
--   get_creator_top_fans(p_tenant uuid, p_query text, p_limit integer, p_period text)=adff02bf74bca1dfc357f96cacd5c691
--   get_dashboard2_creator_summary(p_from date, p_to date)=11a2c14206e107d26b4ab3129b33b0f9
--   get_manager_contact_stats(p_from date, p_to date, p_tenant uuid)=bb688829f0394ac20279bbcaf544f3a6
--   get_manager_growth_stats(p_from date, p_to date, p_tenant uuid)=b8804b2a96788cecbca7026018984328
--   get_manager_roster_stats(p_tenant uuid, p_date date)=62c94b1d00a2c1b4b7650b7928f52bf8
--   get_manager_silent_creators(p_tenant uuid, p_days integer)=8f1e46e8eab48f49943cc1a4c082e9ee
--   get_manager_silent_no_promo(p_tenant uuid, p_days integer, p_low_promo_rate numeric)=71c3a7c57c6ca31a9c94a3e9ef2b0209
--   get_promo_day_breakdown(p_tenant uuid, p_date date, p_manager_name text)=804b403449f781dfbf785edc68b0766f
--   get_promo_day_faltantes(p_tenant uuid, p_date date, p_manager_name text)=f68097a50ce80c6a7351d1e0d5717562
--   get_promo_month_comparison(p_tenant uuid, p_months_back integer, p_manager_name text)=e24d6d82191e591c73360ec8816b5d18
--   get_promolog_action_feed(p_tenant uuid)=d242b65caef031869bf785912922afb5
--   get_promolog_stale_creators(p_days integer)=4885033204e70e08ec223ca4586fd22a
--   get_tg_contact_ig(p_conversation_id uuid)=9ea83f2fab1f24654a42a941ac01c7df
--   get_wa_contact_ig(p_contact_id uuid)=0095e1bd1ba4106ccc71f354015b5fc0
--   mask_email(p text)=2f8d651ac632f10840e0a6409eb99870
--   mask_phone(p text)=5b8385d78cf200f45a7c8041f6f361bb
--   operations_dashboard_kpis(p_from timestamp with time zone, p_to timestamp with time zone)=dedef764f816778da993b3f4daf3e1fa
--   pick_discovery_seeds(p_total integer)=2cd50f84ccbe41444f6181790bef5268
--   promo_creator_period_scores(p_from date, p_to date, p_tenant uuid)=117e3b1519ef036eb3c4e03c92bcaf57
--   promolog_fallos_bloque()=53368ece565fc2d1e5025151667e989e
--   push_desde_notificacion()=23d00da4f99a087e5f4c6a2aab563b8c
--   reactivate_creator(p_creator_id uuid, p_closer_responsible uuid)=5854872c3efeb2ad31dce4828d9bd451
--   set_creator_whatsapp(p_creator_id uuid, p_whatsapp text)=93fbb99a8625da9a757dc53e045ca896
--   validate_notification_fields()=a6d6994d5c670cfd39958e0e70617f8c
--   ventas_tops(_from date, _to date, _limite integer)=178f3c52eefa8a50971fdde7bc628c92
--
-- Huellas de prod que el banco verifica DESPUÉS de cargar las migraciones que
-- ya están en prod (vienen del fixture de roles + esas migraciones):
--   has_creators_global_scope(_user_id uuid)=85baab72ae99f15fdbed4cfd45527e45
--   handle_new_user()=5d68682c40afb082e32cbdd86660327f
-- Y las de las vistas, md5(pg_get_viewdef(v, true)):
--   v_creators=d286f5f820eba757217b16b55f4936f9
--   v_promolog_eligible_creators=efad2ad98ba908312a3dbf8dfdb6a09e
--   v_creator_prospects=55fafddfe25f63d1f04438ddae1c2e51
--
-- Además de prod: la política de SELECT de profiles tal como estaba antes de
-- personas_por_agencia (USING (true); la necesita esa migración para cargar).
--
-- Stubs (NO son de prod): push_notify_enqueue (anota el aviso en
-- public._avisos_push); el trigger CREATORS_WEBHOOK_USERNAME de creators, que en
-- prod manda cada INSERT/UPDATE/DELETE a otro proyecto (aquí anota la operación
-- en public._webhook_creadoras, para ver que el relleno no lo dispara); las
-- tablas que leen las funciones probadas, con las columnas de prod pero sin
-- claves foráneas ni RLS (closers_contacts, closer_creators,
-- creator_status_history, promolog_entries, chatter_identity,
-- chatter_group_members, chatter_group_creators, creator_prospects); tickets
-- (solo para que create_ticket_from_form, que la devuelve, se pueda crear). Los
-- demás triggers de creators no están: no cambian nada de lo que se prueba.
-- ════════════════════════════════════════════════════════════════════════════

set check_function_bodies = off;

-- ─── Stubs ───────────────────────────────────────────────────────────────────
create table public._avisos_push (id bigserial primary key, tipo text, destinatarios uuid[], datos jsonb, titulo text, cuerpo text, url text, etiqueta text, prioridad text);
create function public.push_notify_enqueue(_tipo text, _destinatarios uuid[], _datos jsonb, _titulo text, _cuerpo text, _url text, _etiqueta text, _prioridad text)
returns void language sql as
$f$ insert into public._avisos_push(tipo, destinatarios, datos, titulo, cuerpo, url, etiqueta, prioridad) values (_tipo, _destinatarios, _datos, _titulo, _cuerpo, _url, _etiqueta, _prioridad) $f$;

create table public._webhook_creadoras (id bigserial primary key, op text, creadora uuid, cuando timestamptz default clock_timestamp());
create function public._webhook_creadoras_stub() returns trigger language plpgsql security definer set search_path to 'public' as
$f$ begin insert into public._webhook_creadoras(op, creadora) values (tg_op, coalesce(new.id, old.id)); return null; end $f$;

create table public.closers_contacts (id uuid not null default gen_random_uuid() primary key, name text not null, handle text not null, platform text not null, email text, phone text, country_code text, city text, company text, status text, source text, ticket_number text, notes text, physical_appearance text, profile_picture_url text, media_files jsonb, assigned_to uuid, created_by uuid not null, created_at timestamp with time zone default now(), updated_at timestamp with time zone default now(), onlyfans_url text, record_type text not null default 'nuevo'::text, phone_first_set_at timestamp with time zone, model_id uuid, company_id uuid, leadgen_entry_id uuid, contact_kind text not null default 'modelo'::text);
create table public.closer_creators (id uuid not null default gen_random_uuid() primary key, instagram_handle text not null, category text, passed_date date, source_account text, phone text, notes text, onlyfans_url text, estimated_monetization numeric(12,2) default 0, agency_commission numeric(5,2) default 0, stage text not null default 'Asignada'::text, assigned_to uuid, rejection_reason text, confirmed_date timestamp with time zone, completed_date timestamp with time zone, last_contact_date timestamp with time zone, monthly_monetization numeric(12,2), created_by uuid, company_id uuid, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), leadgen_entry_id uuid, main_platform text, extras numeric default 0, source_contact_id uuid, city text, phone_first_set_at timestamp with time zone, model_id uuid, no_interesada_date timestamp with time zone, close_reason_code text, deal_type text not null default 'reclutamiento'::text, subscription_amount numeric, lead_source text not null default 'maven'::text, lead_meta jsonb);
create table public.creator_status_history (id uuid not null default gen_random_uuid() primary key, creator_id uuid not null, instagram_handle text, name text, old_status text, new_status text not null, changed_by uuid, changed_at timestamp with time zone not null default now(), snapshot jsonb);
create table public.promolog_entries (id uuid not null default gen_random_uuid() primary key, creator_id uuid not null, date timestamp without time zone not null, promoted text default 'pending'::text, network text not null, notes text, reviewed_by uuid, created_at timestamp with time zone default now(), updated_at timestamp with time zone default now(), ticket_number text, platform text, has_buy_link boolean default false, buy_link_type text, contact_type text, evidence_url text, action_taken text, created_by uuid, tenant_id uuid not null default current_tenant_id(), apify_run_id text, dispatch_run_id uuid, analyzed_by_ai boolean not null default false, ai_model text, ai_confidence numeric(4,3), ai_reasoning text, story_index integer, story_count integer, story_media_url text, scraped_at timestamp with time zone, source_handle text, needs_review boolean not null default false, error_reason text, story_link_url text, story_pk text, dia date generated always as (((date - '05:00:00'::interval))::date) stored, dedup_key text, ai_appeal numeric);
create table public.chatter_identity (id uuid not null default gen_random_uuid() primary key, display_name text not null, maven_user_id uuid, email_local text, is_chatter boolean not null default true, active boolean not null default true, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.chatter_group_members (id uuid not null default gen_random_uuid() primary key, group_id uuid not null, identity_id uuid not null, shift text not null, is_supernumerary boolean not null default false, sheet_tag integer, valid_from date not null default CURRENT_DATE, valid_to date, created_at timestamp with time zone not null default now());
create table public.chatter_group_creators (id uuid not null default gen_random_uuid() primary key, group_id uuid not null, creator_id uuid, creator_handle text not null, ig boolean not null default false, mad boolean not null default false, sop boolean not null default false, tag text, valid_from date not null default CURRENT_DATE, valid_to date, created_at timestamp with time zone not null default now());
create table public.creator_prospects (id uuid not null default gen_random_uuid() primary key, name text not null, instagram text, tiktok text, platform text, category text, agency text, country text, email text, phone text, source text, status text not null default 'lead'::text, notes text, created_by uuid, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now());
create table public.tickets (id uuid primary key default gen_random_uuid(), form_id uuid, ticket_code text, creator_id uuid, answers jsonb, title text, description text, priority text, assigned_to text, company text, creator_notes text, ticket_type text, status text);

-- ─── profiles: la política de SELECT de antes de personas_por_agencia ───────
alter table public.profiles enable row level security;
create policy "Authenticated users can view all profiles" on public.profiles as permissive for select to authenticated using (true);

-- ─── creators ────────────────────────────────────────────────────────────────
create table public.creators (id uuid not null default gen_random_uuid(), name text not null, artistic_name text, age integer, bio text, birth_date date, category text, chat_url text, city text, country text, country_code text, created_at timestamp with time zone default now(), email text, external_transfer integer, instagram_followers integer, instagram_handle text, internal_notes text, languages text[], linkedin_handle text, notes text, onlyfans_url text, phone text, phone_e164 text, piclink_url text, profile_photo_url text, registration_date date, source text, status text, tiktok_handle text, twitter_handle text, updated_at timestamp with time zone default now(), whatsapp_number text, youtube_handle text, assigned_manager_id uuid, assigned_specialist_id uuid, closer_responsible_id uuid, assigned_manager_profile_id uuid, assigned_specialist_profile_id uuid, closer_responsible_profile_id uuid, signo_zodiacal text, wishlist_url text, estatura text, medidas_cm text, talla_brasier text, tatuajes_piercings_detalle text, rutina_diaria text, hobbies text, mascotas_nombres text, comida_favorita text, nivel_estudios text, apodos_permitidos text, palabras_prohibidas text, emoji_frecuente text, tono_voz text, contenido_jamas_haria text, precios_contenido jsonb default '{}'::jsonb, segundo_nombre text, direccion text, timezone text, etnicidad text, cicatrices text, nivel_lectura text, permiso_nombre_real boolean default false, permiso_edad_real boolean default false, permiso_ubicacion boolean default false, edad_mostrar integer, ubicacion_artistica text, otras_plataformas text, link_otras_plataformas text, helado_favorito text, bebida_favorita text, musica_artistas text, peliculas_tv text, viajes_favoritos text, viajes_por_visitar text, hermanos text, dia_perfecto text, como_eres_cuando_nadie_ve text, como_quieres_que_te_llamen text, respuesta_sexo_en_persona text, respuesta_usuario_grosero text, respuesta_pedir_desnudos text, que_te_incomoda text, horarios_sueno text, deporte_equipo text, color_favorito text, estado_civil text, que_buscas_pareja text, mejor_atributo_fisico text, metas_largo_plazo text, que_haces_relajarte text, que_te_hace_reir text, que_te_motiva_crear text, respuesta_cuanto_cobra_encuentro text, respuesta_muestra_intimas text, estrategia_material_gratis text, estrategia_problemas_personales text, schedule_config jsonb default '{}'::jsonb, currency text default 'USD'::text, gfe_disponible boolean default false, personalidad_marca text, estrategia_rechazo text, tono_emocional text, frases_venta text, usuarios_vip text, plataforma_videollamada text, estrategia_recuperacion text, interesa_dinamicas_grupales boolean default false, terminos_afecto text, restricciones_seguridad text, orientacion_perfil text, redes_sociales text, wishlist_amazon text, last_autosave_at timestamp with time zone, created_by uuid, entered_crm_at timestamp with time zone, entered_crm_by uuid, entered_crm_notes text, phone_first_set_at timestamp with time zone, model_id uuid, blu_infloww_active boolean not null default false, category_code text, facebook_handle text, reddit_handle text, other_url text, telegram_handle text, rejoined_at timestamp with time zone, rejoined_from uuid, promo_target_networks text[], onboarding_video_key text, onboarding_video_at timestamp with time zone, onboarding_video_bytes bigint, onboarding_video_by uuid);
alter table public.creators add constraint creators_birth_date_plausible CHECK (((birth_date IS NULL) OR ((birth_date >= '1940-01-01'::date) AND (birth_date <= '2015-12-31'::date)))) NOT VALID;
alter table public.creators add constraint creators_pkey PRIMARY KEY (id);
alter table public.creators add constraint promo_target_networks_valid CHECK (((promo_target_networks IS NULL) OR ((cardinality(promo_target_networks) > 0) AND (promo_target_networks <@ ARRAY['instagram'::text, 'x'::text, 'telegram'::text, 'facebook'::text]))));
-- Las claves foráneas a auth.users sí (las otras van a tablas que no están).
alter table public.creators add constraint creators_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
alter table public.creators add constraint creators_entered_crm_by_fkey FOREIGN KEY (entered_crm_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.creators add constraint creators_onboarding_video_by_fkey FOREIGN KEY (onboarding_video_by) REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_creators_instagram ON public.creators USING btree (instagram_handle);
CREATE INDEX idx_creators_status ON public.creators USING btree (status);
CREATE INDEX idx_creators_created_by ON public.creators USING btree (created_by);
CREATE INDEX idx_creators_entered_crm_at ON public.creators USING btree (entered_crm_at DESC) WHERE (entered_crm_at IS NOT NULL);
CREATE INDEX creators_phone_first_set_idx ON public.creators USING btree (phone_first_set_at) WHERE (phone_first_set_at IS NOT NULL);
CREATE INDEX creators_model_id_idx ON public.creators USING btree (model_id) WHERE (model_id IS NOT NULL);
CREATE INDEX idx_creators_category_code ON public.creators USING btree (category_code);
CREATE INDEX idx_creators_updated_at ON public.creators USING btree (updated_at);
CREATE INDEX idx_creators_handle_normalizado ON public.creators USING btree (lower(regexp_replace(instagram_handle, '[@/[:space:]]'::text, ''::text, 'g'::text))) WHERE (NULLIF(TRIM(BOTH FROM instagram_handle), ''::text) IS NOT NULL);

revoke all on public.creators from anon, authenticated;
grant insert, update, delete, truncate, references, trigger, maintain on public.creators to anon, authenticated;
grant select (id, name, artistic_name, age, bio, birth_date, category, chat_url, city, country, country_code, created_at, external_transfer, instagram_followers, instagram_handle, internal_notes, languages, linkedin_handle, notes, onlyfans_url, piclink_url, profile_photo_url, registration_date, source, status, tiktok_handle, twitter_handle, updated_at, youtube_handle, assigned_manager_id, assigned_specialist_id, closer_responsible_id, assigned_manager_profile_id, assigned_specialist_profile_id, closer_responsible_profile_id, signo_zodiacal, wishlist_url, estatura, medidas_cm, talla_brasier, tatuajes_piercings_detalle, rutina_diaria, hobbies, mascotas_nombres, comida_favorita, nivel_estudios, apodos_permitidos, palabras_prohibidas, emoji_frecuente, tono_voz, contenido_jamas_haria, precios_contenido, segundo_nombre, direccion, timezone, etnicidad, cicatrices, nivel_lectura, permiso_nombre_real, permiso_edad_real, permiso_ubicacion, edad_mostrar, ubicacion_artistica, otras_plataformas, link_otras_plataformas, helado_favorito, bebida_favorita, musica_artistas, peliculas_tv, viajes_favoritos, viajes_por_visitar, hermanos, dia_perfecto, como_eres_cuando_nadie_ve, como_quieres_que_te_llamen, respuesta_sexo_en_persona, respuesta_usuario_grosero, respuesta_pedir_desnudos, que_te_incomoda, horarios_sueno, deporte_equipo, color_favorito, estado_civil, que_buscas_pareja, mejor_atributo_fisico, metas_largo_plazo, que_haces_relajarte, que_te_hace_reir, que_te_motiva_crear, respuesta_cuanto_cobra_encuentro, respuesta_muestra_intimas, estrategia_material_gratis, estrategia_problemas_personales, schedule_config, currency, gfe_disponible, personalidad_marca, estrategia_rechazo, tono_emocional, frases_venta, usuarios_vip, plataforma_videollamada, estrategia_recuperacion, interesa_dinamicas_grupales, terminos_afecto, restricciones_seguridad, orientacion_perfil, redes_sociales, wishlist_amazon, last_autosave_at, created_by, entered_crm_at, entered_crm_by, entered_crm_notes, phone_first_set_at, model_id, blu_infloww_active, category_code, facebook_handle, reddit_handle, other_url, telegram_handle) on public.creators to authenticated;

-- ─── notifications ───────────────────────────────────────────────────────────
create table public.notifications (id uuid not null default gen_random_uuid(), user_id uuid, type text not null, title text not null, message text, reference_id uuid, reference_type text, is_read boolean not null default false, created_at timestamp with time zone not null default now(), module_origin text, priority text default 'medium'::text, status text default 'new'::text, deep_link_url text, required_permission_module text, required_permission_submodule text, visibility_scope text default 'personal'::text, role_target text, automation_key text);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX idx_notifications_automation_key ON public.notifications USING btree (automation_key) WHERE (automation_key IS NOT NULL);
alter table public.notifications enable row level security;
create policy "Authenticated users can insert notifications" on public.notifications as permissive for insert to authenticated with check (true);
create policy "Users can delete own notifications" on public.notifications as permissive for delete to public using ((( SELECT auth.uid() AS uid) = user_id));
create policy "Users can update own notifications" on public.notifications as permissive for update to public using (((( SELECT auth.uid() AS uid) = user_id) OR ((user_id IS NULL) AND (role_target IS NOT NULL) AND user_has_role_name(( SELECT auth.uid() AS uid), role_target))));
create policy "Users can view own or role-targeted notifications" on public.notifications as permissive for select to public using (((( SELECT auth.uid() AS uid) = user_id) OR ((user_id IS NULL) AND (role_target IS NOT NULL) AND user_has_role_name(( SELECT auth.uid() AS uid), role_target))));
create policy api_fabricada_no_borra on public.notifications as restrictive for delete to public using ((( SELECT (auth.jwt() ?| ARRAY['mvf'::text, 'mvk'::text])) IS NOT TRUE));
create policy api_fabricada_no_cambia on public.notifications as restrictive for update to public using ((( SELECT (auth.jwt() ?| ARRAY['mvf'::text, 'mvk'::text])) IS NOT TRUE)) with check ((( SELECT (auth.jwt() ?| ARRAY['mvf'::text, 'mvk'::text])) IS NOT TRUE));
create policy api_fabricada_no_inserta on public.notifications as restrictive for insert to public with check ((( SELECT (auth.jwt() ?| ARRAY['mvf'::text, 'mvk'::text])) IS NOT TRUE));

-- ─── Funciones (copia textual de prod) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chatter_can_view_creator(_uid uuid, _creator_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.chatter_identity i
    JOIN public.chatter_group_members m ON m.identity_id = i.id AND m.valid_to IS NULL AND m.valid_from <= CURRENT_DATE
    JOIN public.chatter_group_creators c ON c.group_id = m.group_id AND c.valid_to IS NULL AND c.valid_from <= CURRENT_DATE
    WHERE i.maven_user_id = _uid AND c.creator_id = _creator_id)
$function$
;

CREATE OR REPLACE FUNCTION public.mask_email(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p is null then null
    when position('@' in p) = 0 then repeat(chr(8226), 4)
    else left(p, 1) || repeat(chr(8226), 3) || substring(p from position('@' in p))
  end
$function$
;

CREATE OR REPLACE FUNCTION public.mask_phone(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select case when p is null then null when length(regexp_replace(p, '[^0-9]', '', 'g')) <= 4 then repeat(chr(8226), 4) else repeat(chr(8226), length(regexp_replace(p, '[^0-9]', '', 'g')) - 4) || right(regexp_replace(p, '[^0-9]', '', 'g'), 4) end $function$
;

CREATE OR REPLACE FUNCTION public.validate_notification_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.priority IS NOT NULL AND NEW.priority NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid priority: %', NEW.priority;
  END IF;
  IF NEW.status IS NOT NULL AND NEW.status NOT IN ('new', 'read', 'archived') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  IF NEW.visibility_scope IS NOT NULL AND NEW.visibility_scope NOT IN ('personal', 'team', 'global') THEN
    RAISE EXCEPTION 'Invalid visibility_scope: %', NEW.visibility_scope;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.push_desde_notificacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.user_id is null or new.type is null or new.type in ('chat_message', 'chat_mention') then
    return null;
  end if;
  if new.required_permission_module is not null
     and not public.puede_ver_modulo(new.user_id, new.required_permission_module, new.required_permission_submodule) then
    return null;
  end if;
  if exists (
    select 1 from notifications n
    where n.user_id = new.user_id and n.type = new.type
      and date_trunc('minute', n.created_at) = date_trunc('minute', new.created_at)
      and (n.created_at, n.id) < (new.created_at, new.id)
  ) then
    return null;
  end if;
  perform public.push_notify_enqueue(
    new.type,
    array[new.user_id],
    jsonb_build_object('notification_id', new.id, 'reference_type', new.reference_type, 'reference_id', new.reference_id),
    coalesce(nullif(new.title, ''), 'Maven'),
    coalesce(new.message, ''),
    coalesce(nullif(new.deep_link_url, ''), '/notificaciones'),
    'notif-' || new.id,
    case when new.priority in ('critical', 'high') then 'normal' else 'low' end
  );
  return null;
end
$function$
;

CREATE TRIGGER on_notification_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION push_desde_notificacion();
CREATE TRIGGER trg_validate_notification_fields BEFORE INSERT OR UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION validate_notification_fields();

CREATE OR REPLACE FUNCTION public.contact_filter_cities()
 RETURNS SETOF text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select distinct btrim(cr.city)
  from public.closers_contacts cc
  join public.creators cr
    on lower(regexp_replace(coalesce(cr.instagram_handle,''),'^@','')) =
       lower(regexp_replace(coalesce(cc.handle,''),'^@',''))
  where cr.city is not null and btrim(cr.city) <> ''
    and cc.handle is not null and btrim(cc.handle) <> ''
  order by 1;
$function$
;

CREATE OR REPLACE FUNCTION public.contact_ids_by_city(p_city text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select cc.id
  from public.closers_contacts cc
  join public.creators cr
    on lower(regexp_replace(coalesce(cr.instagram_handle,''),'^@','')) =
       lower(regexp_replace(coalesce(cc.handle,''),'^@',''))
  where btrim(cr.city) = btrim(p_city)
    and cc.handle is not null and btrim(cc.handle) <> ''
    and cr.instagram_handle is not null and btrim(cr.instagram_handle) <> '';
$function$
;

CREATE OR REPLACE FUNCTION public.find_creator_history_by_handle(p_handle text)
 RETURNS TABLE(creator_id uuid, name text, status text, source text, last_change timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (
    select regexp_replace(lower(trim(coalesce(p_handle,''))), '^@', '') as h
  )
  select c.id, coalesce(nullif(c.artistic_name,''), c.name), c.status, 'creators'::text, c.created_at
  from public.creators c, q
  where q.h <> '' and lower(coalesce(c.instagram_handle,'')) = q.h
  union all
  select s.creator_id, s.name, s.new_status, 'history'::text, s.changed_at
  from public.creator_status_history s, q
  where q.h <> '' and lower(coalesce(s.instagram_handle,'')) = q.h
    and s.new_status = 'deleted'
    and not exists (select 1 from public.creators c2 where c2.id = s.creator_id)
  order by 5 desc
$function$
;

CREATE OR REPLACE FUNCTION public.find_creator_name_by_email(p_email text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select name from public.creators where email ilike btrim(p_email) limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.find_creator_name_by_phone(p_phone text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select name from public.creators where phone = p_phone limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_promo_day_breakdown(p_tenant uuid, p_date date DEFAULT NULL::date, p_manager_name text DEFAULT NULL::text)
 RETURNS TABLE(manager_name text, creator_id uuid, creadora text, handle text, cuentas text, promo_stories integer, networks text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (
    select coalesce(p_date, (now() at time zone 'America/Bogota')::date) as day
  )
  select
    m.full_name as manager_name,
    c.id as creator_id,
    coalesce(nullif(c.artistic_name,''), nullif(c.instagram_handle,''), c.name) as creadora,
    coalesce(nullif(c.instagram_handle,''), nullif(c.artistic_name,''), c.name) as handle,
    nullif(string_agg(distinct lower(coalesce(nullif(e.source_handle,''), '')), ', ') filter (
      where coalesce(e.source_handle,'') <> ''
    ), '') as cuentas,
    greatest(max(coalesce(e.story_count, 1)), 1)::int as promo_stories,
    nullif(string_agg(distinct lower(coalesce(e.network, e.platform, '')), ', ') filter (
      where coalesce(e.network, e.platform, '') <> ''
    ), '') as networks
  from promolog_entries e
  cross join d
  join creators c on c.id = e.creator_id and c.status = 'active'
  left join profiles m on m.id = c.assigned_manager_profile_id
  where e.tenant_id = p_tenant
    and e.dia = d.day
    and e.promoted = 'true'
    and (p_manager_name is null or m.full_name ilike '%' || p_manager_name || '%')
  group by m.full_name, c.id, c.instagram_handle, c.artistic_name, c.name
  order by m.full_name nulls last, promo_stories desc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_promo_day_faltantes(p_tenant uuid, p_date date DEFAULT NULL::date, p_manager_name text DEFAULT NULL::text)
 RETURNS TABLE(manager_name text, creadora text, estado text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (
    select coalesce(p_date, (now() at time zone 'America/Bogota')::date) as day
  ),
  hoy as (
    select e.creator_id,
           bool_or(e.promoted = 'true') as promo,
           bool_or(e.promoted = 'false') as leida
    from promolog_entries e cross join d
    where e.tenant_id = p_tenant and e.dia = d.day
    group by e.creator_id
  )
  select
    m.full_name as manager_name,
    coalesce(nullif(c.artistic_name,''), nullif(c.instagram_handle,''), c.name) as creadora,
    case when coalesce(h.leida, false) then 'leida_sin_promo' else 'sin_leer' end as estado
  from creators c
  left join profiles m on m.id = c.assigned_manager_profile_id
  left join hoy h on h.creator_id = c.id
  where c.status = 'active'
    and not coalesce(h.promo, false)
    and (p_manager_name is null or m.full_name ilike '%' || p_manager_name || '%')
  order by m.full_name nulls last, estado, creadora;
$function$
;

CREATE OR REPLACE FUNCTION public.get_promolog_stale_creators(p_days integer DEFAULT 7)
 RETURNS TABLE(creator_id uuid, name text, handle text, days_empty integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select c.id, coalesce(nullif(c.artistic_name,''),c.name),
         lower(regexp_replace(coalesce(c.instagram_handle,''),'.*instagram\.com/|[@/ ]','','gi')),
         p_days
  from creators c
  where c.status='active' and nullif(trim(c.instagram_handle),'') is not null
    and not exists (
      select 1 from promolog_entries e
      where e.creator_id=c.id and e.network ilike 'instagram'
        and e.story_count>0 and e.dia >= (now() at time zone 'America/Bogota')::date - p_days
    );
$function$
;

CREATE OR REPLACE FUNCTION public.reactivate_creator(p_creator_id uuid, p_closer_responsible uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, status text, rejoined_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not (public.has_role(auth.uid(), 'closer'::app_role)
          or public.is_in_role_group(auth.uid(), 'supervisor_or_above')
          or public.has_creators_global_scope(auth.uid())) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  update public.creators c
     set status = 'onboarding',
         rejoined_at = now(),
         closer_responsible_id = coalesce(p_closer_responsible, auth.uid())
   where c.id = p_creator_id
     and c.status in ('terminated', 'leaving', 'paused')
  returning c.id, c.status, c.rejoined_at;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_creator_whatsapp(p_creator_id uuid, p_whatsapp text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.user_roles where user_id = auth.uid()) then
    raise exception 'Sin permiso' using errcode = '42501';
  end if;
  update public.creators
     set whatsapp_number = nullif(btrim(p_whatsapp), '')
   where id = p_creator_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.convert_contact_to_creator(p_contact_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_c   public.closers_contacts%rowtype;
  v_new uuid;
  v_norm text;
begin
  if v_uid is null then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_c from public.closers_contacts where id = p_contact_id;
  if not found then raise exception 'contact_not_found'; end if;
  if v_c.handle is null or btrim(v_c.handle) = '' then raise exception 'missing_handle'; end if;
  v_norm := lower(regexp_replace(v_c.handle, '.*instagram\.com/|[@/ ]', '', 'gi'));
  if exists (
    select 1 from public.creators
    where status is distinct from 'terminated'
      and lower(regexp_replace(coalesce(instagram_handle,''), '.*instagram\.com/|[@/ ]', '', 'gi')) = v_norm
  ) then
    raise exception 'creator_already_exists'
      using errcode = '23505', hint = 'Ya existe una creadora con ese Instagram (' || v_c.handle || ').';
  end if;
  insert into public.creators (
    name, instagram_handle, country, category, phone, country_code, email,
    profile_photo_url, source, status, internal_notes, created_by
  ) values (
    v_c.name, v_c.handle, v_c.country_code, v_c.physical_appearance, v_c.phone,
    v_c.country_code, v_c.email, v_c.profile_picture_url, 'contacto', 'pendiente',
    case when v_c.company is not null then 'Compañía: ' || v_c.company else null end, v_uid
  ) returning id into v_new;
  update public.closers_contacts set status = 'converted' where id = p_contact_id;
  return v_new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.create_platform_deal_for_creator(p_creator_id uuid, p_platform text, p_subscription_amount numeric, p_closer_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_creator public.creators%rowtype;
  v_deal_id uuid;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'Permiso denegado: Closers / Asignar Closer.' using errcode = '42501';
  end if;

  select * into v_creator from public.creators where id = p_creator_id;
  if not found then
    raise exception 'Creadora no encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(trim(p_platform), '') = '' then
    raise exception 'Plataforma requerida.' using errcode = '22004';
  end if;

  select id into v_deal_id
  from public.closer_creators
  where deal_type = 'venta_plataforma'
    and stage not in ('Completada', 'No interesada')
    and lower(coalesce(main_platform, '')) = lower(p_platform)
    and (
      (v_creator.model_id is not null and model_id = v_creator.model_id)
      or lower(trim(both '@' from instagram_handle)) = lower(trim(both '@' from coalesce(v_creator.instagram_handle, '')))
    )
  limit 1;

  if v_deal_id is not null then
    update public.closer_creators
      set subscription_amount = coalesce(p_subscription_amount, subscription_amount),
          assigned_to = coalesce(p_closer_id, assigned_to),
          stage = case when p_closer_id is not null and stage = 'Nuevo' then 'Asignada' else stage end,
          passed_date = case when p_closer_id is not null then coalesce(passed_date, current_date) else passed_date end
    where id = v_deal_id;
    return v_deal_id;
  end if;

  insert into public.closer_creators (
    instagram_handle, phone, category, main_platform,
    deal_type, subscription_amount, model_id,
    assigned_to, stage, passed_date, created_by,
    estimated_monetization, agency_commission
  ) values (
    coalesce(nullif(v_creator.instagram_handle, ''), nullif(v_creator.name, ''), 'sin_handle'),
    coalesce(v_creator.phone_e164, v_creator.phone),
    v_creator.category,
    p_platform,
    'venta_plataforma',
    p_subscription_amount,
    v_creator.model_id,
    p_closer_id,
    case when p_closer_id is not null then 'Asignada' else 'Nuevo' end,
    case when p_closer_id is not null then current_date else null end,
    auth.uid(),
    0, 0
  ) returning id into v_deal_id;

  return v_deal_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_recruitment_deal_for_creator(p_creator_id uuid, p_closer_id uuid DEFAULT NULL::uuid, p_estimated_monetization numeric DEFAULT 0, p_agency_commission numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_creator public.creators%rowtype;
  v_handle  text;
  v_deal_id uuid;
begin
  if not public.has_permission(auth.uid(), 'Closers', 'Asignar Closer') then
    raise exception 'Permiso denegado: Closers / Asignar Closer.' using errcode = '42501';
  end if;

  select * into v_creator from public.creators where id = p_creator_id;
  if not found then
    raise exception 'Creadora no encontrada.' using errcode = 'P0002';
  end if;

  v_handle := coalesce(
    nullif(
      lower(regexp_replace(
        regexp_replace(trim(coalesce(v_creator.instagram_handle, '')), '^https?://(www\.)?instagram\.com/', '', 'i'),
        '[/@?[:space:]]', '', 'g'
      )),
      ''
    ),
    nullif(trim(coalesce(v_creator.name, '')), ''),
    'sin_handle'
  );

  if lower(v_handle) <> 'sin_handle' then
    select id into v_deal_id
    from public.closer_creators
    where lower(regexp_replace(
            regexp_replace(trim(coalesce(instagram_handle, '')), '^https?://(www\.)?instagram\.com/', '', 'i'),
            '[/@?[:space:]]', '', 'g'
          )) = v_handle
      and stage in ('Nuevo', 'Asignada', 'Confirmada')
    order by created_at asc
    limit 1;
  end if;

  if v_deal_id is not null then
    update public.closer_creators
      set assigned_to = coalesce(p_closer_id, assigned_to),
          stage = case when p_closer_id is not null and stage = 'Nuevo' then 'Asignada' else stage end,
          passed_date = case when p_closer_id is not null then coalesce(passed_date, current_date) else passed_date end,
          estimated_monetization = case
            when coalesce(estimated_monetization, 0) = 0 and coalesce(p_estimated_monetization, 0) > 0
              then p_estimated_monetization else estimated_monetization end,
          agency_commission = case
            when coalesce(agency_commission, 0) = 0 and coalesce(p_agency_commission, 0) > 0
              then p_agency_commission else agency_commission end,
          model_id = coalesce(model_id, v_creator.model_id),
          lead_source = case when lead_source = 'maven' then 'ex_creadora' else lead_source end
    where id = v_deal_id;
    return v_deal_id;
  end if;

  insert into public.closer_creators (
    instagram_handle, phone, category, model_id,
    deal_type, lead_source,
    assigned_to, stage, passed_date, created_by,
    estimated_monetization, agency_commission
  ) values (
    v_handle,
    coalesce(v_creator.phone_e164, v_creator.phone),
    v_creator.category,
    v_creator.model_id,
    'reclutamiento',
    'ex_creadora',
    p_closer_id,
    case when p_closer_id is not null then 'Asignada' else 'Nuevo' end,
    case when p_closer_id is not null then current_date else null end,
    auth.uid(),
    coalesce(p_estimated_monetization, 0),
    coalesce(p_agency_commission, 0)
  ) returning id into v_deal_id;

  return v_deal_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_ticket_from_form(p_form_id uuid, p_answers jsonb, p_creator_id uuid DEFAULT NULL::uuid)
 RETURNS tickets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_form   public.ticket_forms;
  v_field  public.ticket_form_fields;
  v_code     text;
  v_ticket   public.tickets;
  v_val      jsonb;
  v_core     jsonb := '{}'::jsonb;
  v_title    text;
  v_priority text;
  v_creator  uuid := p_creator_id;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere sesion para crear un ticket';
  END IF;
  IF NOT public.has_permission(auth.uid(), 'Tickets', 'Crear Ticket') THEN
    RAISE EXCEPTION 'Sin permiso para crear tickets';
  END IF;
  SELECT * INTO v_form FROM public.ticket_forms WHERE id = p_form_id;
  IF v_form.id IS NULL THEN
    RAISE EXCEPTION 'Plantilla de ticket inexistente: %', p_form_id;
  END IF;
  IF NOT v_form.is_published OR v_form.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'La plantilla "%" no esta publicada', v_form.name;
  END IF;

  FOR v_field IN
    SELECT * FROM public.ticket_form_fields WHERE form_id = p_form_id ORDER BY position
  LOOP
    v_val := p_answers -> v_field.field_key;

    IF v_field.is_required AND (
         v_val IS NULL
      OR v_val = 'null'::jsonb
      OR (jsonb_typeof(v_val) = 'string' AND btrim(v_val #>> '{}') = '')
      OR (jsonb_typeof(v_val) = 'array'  AND jsonb_array_length(v_val) = 0)
    ) THEN
      RAISE EXCEPTION 'El campo "%" es obligatorio', v_field.label;
    END IF;

    -- La pregunta de tipo creadora es la fuente de tickets.creator_id.
    IF v_field.field_type = 'creator' AND v_val IS NOT NULL AND jsonb_typeof(v_val) = 'string' THEN
      BEGIN
        v_creator := (v_val #>> '{}')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'La respuesta de "%" no es una creadora valida', v_field.label;
      END;
    END IF;

    IF v_field.maps_to IS NOT NULL AND v_val IS NOT NULL THEN
      v_core := v_core || jsonb_build_object(v_field.maps_to, v_val);
    END IF;
  END LOOP;

  IF v_creator IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.creators c WHERE c.id = v_creator) THEN
    RAISE EXCEPTION 'La creadora indicada no existe';
  END IF;

  IF NULLIF(btrim(COALESCE(v_core #>> '{title}', '')), '') IS NULL THEN
    IF v_creator IS NOT NULL THEN
      SELECT COALESCE(NULLIF(btrim(c.artistic_name), ''), c.name)
        INTO v_title FROM public.creators c WHERE c.id = v_creator;
    END IF;
    v_title := COALESCE(NULLIF(btrim(COALESCE(v_title, '')), ''), v_form.name);
  ELSE
    v_title := btrim(v_core #>> '{title}');
  END IF;

  v_priority := lower(btrim(COALESCE(v_core #>> '{priority}', '')));
  IF v_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
    v_priority := 'medium';
  END IF;

  v_code := public.next_ticket_code(p_form_id);

  INSERT INTO public.tickets (
    form_id, ticket_code, creator_id, answers,
    title, description, priority, assigned_to, company, creator_notes,
    ticket_type, status
  )
  VALUES (
    p_form_id, v_code, v_creator, COALESCE(p_answers, '{}'::jsonb),
    v_title,
    NULLIF(btrim(COALESCE(v_core #>> '{description}', '')), ''),
    v_priority,
    NULLIF(btrim(COALESCE(v_core #>> '{assigned_to}', '')), ''),
    NULLIF(btrim(COALESCE(v_core #>> '{company}', '')), ''),
    NULLIF(btrim(COALESCE(v_core #>> '{creator_notes}', '')), ''),
    'general', 'open'
  )
  RETURNING * INTO v_ticket;

  RETURN v_ticket;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tg_contact_ig(p_conversation_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ct as (
    select closer_creator_id,
           right(regexp_replace(coalesce(peer_phone, ''), '\D', '', 'g'), 10) as d10
    from public.tg_conversations
    where id = p_conversation_id
      and tenant_id = public.current_tenant_id()
      and (
        public.has_tg_inbox_global_scope(auth.uid())
        or assigned_to = auth.uid()
        or public.is_tg_assignee(id, auth.uid())
      )
  )
  select ig from (
    -- 1) FK directo al lead del pipeline (sin ambigüedad; no depende del teléfono)
    select 1 as pri, cc.instagram_handle as ig
      from ct join public.closer_creators cc on cc.id = ct.closer_creator_id
     where coalesce(cc.instagram_handle, '') <> ''
    union all
    -- 2) lead del pipeline por teléfono (últimos 10 dígitos)
    select 2, cc.instagram_handle
      from ct join public.closer_creators cc
        on length(ct.d10) = 10
       and right(regexp_replace(coalesce(cc.phone, ''), '\D', '', 'g'), 10) = ct.d10
     where coalesce(cc.instagram_handle, '') <> ''
    union all
    -- 3) creadora firmada por teléfono
    select 3, cr.instagram_handle
      from ct join public.creators cr
        on length(ct.d10) = 10
       and right(regexp_replace(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone, ''), '\D', '', 'g'), 10) = ct.d10
     where coalesce(cr.instagram_handle, '') <> ''
  ) t
  order by pri
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_wa_contact_ig(p_contact_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with ct as (
    select closer_creator_id,
           right(regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g'), 10) as d10
    from public.wa_contacts
    where id = p_contact_id
      -- SECURITY DEFINER bypassa RLS → gateamos a mano igual que wa_contacts_select
      -- (tenant + scope global / conversación asignada o co-asignada) para no
      -- filtrar el @IG de contactos que el caller no puede ver, ni cruzar tenants.
      and tenant_id = public.current_tenant_id()
      and (
        public.has_wa_inbox_global_scope(auth.uid())
        or exists (
          select 1 from public.wa_conversations c
          where c.contact_id = wa_contacts.id
            and (c.assigned_to = auth.uid() or public.is_wa_assignee(c.id, auth.uid()))
        )
      )
  )
  select ig from (
    -- 1) FK directo al lead del pipeline (sin ambigüedad)
    select 1 as pri, cc.instagram_handle as ig
      from ct join public.closer_creators cc on cc.id = ct.closer_creator_id
     where coalesce(cc.instagram_handle, '') <> ''
    union all
    -- 2) lead del pipeline por teléfono (últimos 10 dígitos)
    select 2, cc.instagram_handle
      from ct join public.closer_creators cc
        on length(ct.d10) = 10
       and right(regexp_replace(coalesce(cc.phone, ''), '\D', '', 'g'), 10) = ct.d10
     where coalesce(cc.instagram_handle, '') <> ''
    union all
    -- 3) creadora firmada por teléfono
    select 3, cr.instagram_handle
      from ct join public.creators cr
        on length(ct.d10) = 10
       and right(regexp_replace(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone, ''), '\D', '', 'g'), 10) = ct.d10
     where coalesce(cr.instagram_handle, '') <> ''
  ) t
  order by pri
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_contact_funnel_list(p_bucket text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, name text, handle text, city text, country_code text, physical_appearance text, status text, created_at timestamp with time zone, profile_picture_url text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_bucket = 'churn' then
    return query
      select c.id, c.name, nullif(trim(c.instagram_handle),'') as handle, c.city, c.country_code,
             (case when c.status = 'leaving' then 'Saliendo' else 'Baja' end) as physical_appearance,
             c.status, c.created_at, null::text as profile_picture_url
      from public.creators c
      where c.status in ('leaving','terminated')
      order by (c.status='leaving') desc, c.name asc
      limit 100;
    return;
  end if;
  return query
  with base as (
    select c.id, c.source,
      case
        when cr.status in ('terminated','leaving') then 'ex_creator'
        when cr.id is not null then 'creator_active'
        when cc.assigned_to is not null or cc.stage = 'Asignada'
          or c.status in ('contacted','interested','converted') or won.cid is not null then 'in_progress'
        else 'none'
      end as lc
    from public.closers_contacts c
    left join lateral (select cr2.id, cr2.status from public.creators cr2
      where nullif(trim(cr2.instagram_handle),'') is not null
        and lower(regexp_replace(cr2.instagram_handle,'[@/[:space:]]','','g')) =
            lower(regexp_replace(regexp_replace(coalesce(c.handle,''),'^https?://(www\.)?instagram\.com/','','i'),'[@/[:space:]]','','g'))
      order by (cr2.status='active') desc nulls last limit 1) cr on true
    left join lateral (select cc2.assigned_to, cc2.stage from public.closer_creators cc2
      where cc2.source_contact_id = c.id order by (cc2.assigned_to is not null) desc, cc2.created_at desc nulls last limit 1) cc on true
    left join lateral (select 1 as cid from public.closer_creators w where w.source_contact_id=c.id and w.stage in ('Confirmada','Completada') limit 1) won on true
    where (p_from is null or c.created_at >= p_from::timestamptz)
      and (p_to is null or c.created_at < ((p_to + 1)::timestamptz))
  )
  select cc.id, cc.name, cc.handle, cc.city, cc.country_code, cc.physical_appearance,
         cc.status, cc.created_at, cc.profile_picture_url
  from base b
  join public.closers_contacts cc on cc.id = b.id
  where b.source is distinct from 'import_kash_sheet'
    and case p_bucket
      when 'pipeline' then true
      when 'none' then b.lc = 'none'
      when 'in_progress' then b.lc = 'in_progress'
      when 'creator_active' then b.lc = 'creator_active'
      when 'ex_creator' then b.lc = 'ex_creator'
      else false end
  order by cc.created_at desc nulls last
  limit 100;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_contact_funnel_stats(p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  with base as (
    select c.id, c.source,
      case
        when cr.status in ('terminated','leaving') then 'ex_creator'
        when cr.id is not null then 'creator_active'
        when cc.assigned_to is not null or cc.stage = 'Asignada'
          or c.status in ('contacted','interested','converted') or won.cid is not null then 'in_progress'
        else 'none'
      end as lc
    from public.closers_contacts c
    left join lateral (select cr2.id, cr2.status from public.creators cr2
      where nullif(trim(cr2.instagram_handle),'') is not null
        and lower(regexp_replace(cr2.instagram_handle,'[@/[:space:]]','','g')) =
            lower(regexp_replace(regexp_replace(coalesce(c.handle,''),'^https?://(www\.)?instagram\.com/','','i'),'[@/[:space:]]','','g'))
      order by (cr2.status='active') desc nulls last limit 1) cr on true
    left join lateral (select cc2.assigned_to, cc2.stage from public.closer_creators cc2
      where cc2.source_contact_id = c.id order by (cc2.assigned_to is not null) desc, cc2.created_at desc nulls last limit 1) cc on true
    left join lateral (select 1 as cid from public.closer_creators w where w.source_contact_id=c.id and w.stage in ('Confirmada','Completada') limit 1) won on true
    where (p_from is null or c.created_at >= p_from::timestamptz)
      and (p_to is null or c.created_at < ((p_to + 1)::timestamptz))
  ),
  vivo as (select * from base where source is distinct from 'import_kash_sheet')
  select jsonb_build_object(
    'total', (select count(*) from base),
    'import_muerto', (select count(*) from base where source = 'import_kash_sheet'),
    'pipeline_vivo', (select count(*) from vivo),
    'lifecycle', (select coalesce(jsonb_object_agg(lc, n), '{}'::jsonb) from (select lc, count(*) n from vivo group by lc) z),
    'activas_hoy', (select count(*) from public.creators where status = 'active'),
    'churn', jsonb_build_object(
      'leaving', (select count(*) from public.creators where status = 'leaving'),
      'terminated', (select count(*) from public.creators where status = 'terminated')),
    'by_source', (select coalesce(jsonb_agg(jsonb_build_object(
        'source', coalesce(source, '(sin fuente)'), 'total', t,
        'in_progress', ip, 'creator_active', ca, 'ex_creator', ex) order by ca desc, t desc), '[]'::jsonb)
      from (select source, count(*) t,
              count(*) filter (where lc='in_progress') ip,
              count(*) filter (where lc='creator_active') ca,
              count(*) filter (where lc='ex_creator') ex
            from vivo group by source) s)
  ) into result;
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_contact_history(p_contact_id uuid)
 RETURNS TABLE(event_at timestamp with time zone, kind text, title text, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_handle text;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
  select lower(regexp_replace(coalesce(handle,''),'^@','')) into v_handle
  from public.closers_contacts where id = p_contact_id;

  return query
  with nm as (select id, full_name from public.profiles),
  cc as (select * from public.closer_creators where source_contact_id = p_contact_id),
  cr as (select * from public.creators where v_handle <> '' and lower(regexp_replace(coalesce(instagram_handle,''),'^@','')) = v_handle)
  -- 1) Alta como contacto
  select c.created_at, 'alta',
    'Alta como contacto' || case when c.record_type = 'reactivado' then ' (reactivado)' else '' end,
    'Agente: ' || coalesce((select full_name from nm where id = c.created_by), '—')
      || case when c.company is not null then ' · Compañía: ' || c.company else '' end
  from public.closers_contacts c where c.id = p_contact_id
  -- 2) Origen LeadGen
  union all
  select le.created_at, 'lead', 'Generado por LeadGen',
    coalesce('Calidad: ' || le.quality, '') || coalesce(' · ' || le.company, '')
  from public.closers_contacts c
  join public.leadgen_entries le on le.id = c.leadgen_entry_id
  where c.id = p_contact_id
  -- 3) Cambios de categoría
  union all
  select ch.changed_at, 'cambio',
    'Cambió categoría: ' || coalesce(ch.old_category,'—') || ' → ' || coalesce(ch.new_category,'—'),
    'por ' || coalesce((select full_name from nm where id = ch.changed_by), '—')
  from public.contact_category_changes ch where ch.contact_id = p_contact_id
  -- 4) Pipeline del closer
  union all
  select cc.created_at, 'pipeline', 'Entró al pipeline de closers',
    'Closer: ' || coalesce((select full_name from nm where id = cc.assigned_to), 'sin asignar')
      || ' · Etapa: ' || coalesce(cc.stage,'—') from cc
  union all
  select cc.confirmed_date, 'pipeline', 'Confirmada en el pipeline', null from cc where cc.confirmed_date is not null
  union all
  select cc.completed_date, 'pipeline', 'Completada en el pipeline', null from cc where cc.completed_date is not null
  union all
  select cc.no_interesada_date, 'baja', 'Marcada como No interesada', null from cc where cc.no_interesada_date is not null
  union all
  select cc.updated_at, 'pipeline', 'Rechazada', cc.rejection_reason from cc where cc.rejection_reason is not null
  union all
  select cc.updated_at, 'nota', 'Nota del closer (pipeline)', cc.notes from cc where cc.notes is not null and btrim(cc.notes) <> ''
  -- 5) Contactos hechos por el closer (closer_contact_history)
  union all
  select h.contact_date, 'contactos', 'Contacto por ' || coalesce(h.channel,'—'),
    coalesce('Resultado: ' || h.result, '') || coalesce(' · ' || h.notes, '')
      || ' · por ' || coalesce((select full_name from nm where id = h.created_by), '—')
  from public.closer_contact_history h join cc on cc.id = h.creator_id
  -- 6) Interacciones (contact_interactions) — acotado: solo con permiso global o propias
  union all
  select i.interaction_date, 'contactos', 'Interacción: ' || coalesce(i.interaction_type,'—'),
    coalesce(i.call_summary, i.notes) || coalesce(' · ' || i.resulting_status, '')
  from public.contact_interactions i where i.contact_id = p_contact_id
    and (public.has_contactos_global_scope(auth.uid()) or i.user_id = auth.uid())
  -- 7) Conversión a creadora
  union all
  select cr.created_at, 'conversion', 'Convertida a creadora',
    'Estado: ' || coalesce(cr.status,'—') || coalesce(' · Origen: ' || cr.source, '') from cr
  -- 8) Asignada a agencia
  union all
  select cb.start_date, 'agencia', 'Asignada a agencia',
    'Agencia: ' || coalesce(cb.assigned_agency,'—') from cr join public.creator_business cb on cb.creator_id = cr.id
  -- 9) Baja / offboarding
  union all
  select coalesce(off.exit_date, off.created_at), 'baja', 'Dejó la agencia (offboarding)',
    'Estado: ' || coalesce(off.status,'—') || coalesce(' · Motivo: ' || off.motivo_final, '')
  from cr join public.creator_offboardings off on off.creator_id = cr.id
  -- 10) Notas en el perfil de creadora
  union all
  select n.created_at, 'nota', 'Nota en perfil de creadora', n.note_text
  from cr join public.creator_notes n on n.creator_id = cr.id

  order by 1 asc nulls last;
end; $function$
;

CREATE OR REPLACE FUNCTION public.get_contact_statuses()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  result := jsonb_build_object('rows', (
    select coalesce(jsonb_agg(jsonb_build_object('contact_id', x.id, 'status', x.status)), '[]'::jsonb)
    from (
      select c.id,
        case
          when cr.status in ('terminated','leaving') then 'ex_creator'
          when cr.id is not null then 'creator_active'
          when cc.assigned_to is not null or cc.stage = 'Asignada'
            or c.status in ('contacted','interested','converted') or won.cid is not null then 'in_progress'
          else 'none'
        end as status
      from public.closers_contacts c
      left join lateral (select cr2.id, cr2.status from public.creators cr2
        where nullif(trim(cr2.instagram_handle),'') is not null
          and lower(regexp_replace(cr2.instagram_handle,'[@/[:space:]]','','g')) =
              lower(regexp_replace(regexp_replace(coalesce(c.handle,''),'^https?://(www\.)?instagram\.com/','','i'),'[@/[:space:]]','','g'))
        order by (cr2.status='active') desc nulls last limit 1) cr on true
      left join lateral (select cc2.assigned_to, cc2.stage from public.closer_creators cc2
        where cc2.source_contact_id = c.id order by (cc2.assigned_to is not null) desc, cc2.created_at desc nulls last limit 1) cc on true
      left join lateral (select 1 as cid from public.closer_creators w where w.source_contact_id=c.id and w.stage in ('Confirmada','Completada') limit 1) won on true
    ) x where x.status <> 'none'
  ));
  return result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard2_creator_summary(p_from date, p_to date)
 RETURNS TABLE(group_key text, creator_id uuid, blu_creator_name text, artistic_name text, total numeric, subs numeric, new_sub numeric, recurring_sub numeric, tips numeric, messages numeric, max_active_fans numeric, new_fans numeric, days_with_data integer, last_date date, af_sum numeric, af_days integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not coalesce(public.blu_is_management(auth.uid()), false) then
    raise exception 'forbidden: management only' using errcode = '42501';
  end if;
  return query
  with por_dia as (
    select coalesce(e.creator_id::text, e.blu_creator_name, e.id::text) as gk,
           e.date as d,
           min(e.creator_id::text) as cid,
           max(e.blu_creator_name) as bname,
           coalesce(sum(e.total_gross), 0) as total,
           coalesce(sum(e.subscription_gross), 0) as subs,
           coalesce(sum(e.new_sub_gross), 0) as new_sub,
           coalesce(sum(e.recurring_sub_gross), 0) as recurring_sub,
           coalesce(sum(e.tips_gross), 0) as tips,
           coalesce(sum(e.message_gross), 0) as messages,
           coalesce(sum(e.active_fans), 0) as active_fans,
           coalesce(sum(e.new_fans), 0) as new_fans
    from public.creator_daily_earnings e
    where e.date >= p_from and e.date <= p_to
    group by 1, 2
  )
  select p.gk,
         min(p.cid)::uuid,
         max(p.bname),
         max(c.artistic_name),
         sum(p.total)::numeric,
         sum(p.subs)::numeric,
         sum(p.new_sub)::numeric,
         sum(p.recurring_sub)::numeric,
         sum(p.tips)::numeric,
         sum(p.messages)::numeric,
         coalesce(max(p.active_fans), 0)::numeric,
         sum(p.new_fans)::numeric,
         count(*)::integer,
         max(p.d),
         coalesce(sum(p.active_fans) filter (where p.active_fans > 0), 0)::numeric,
         (count(*) filter (where p.active_fans > 0))::integer
  from por_dia p
  left join public.creators c on c.id = p.cid::uuid
  group by p.gk;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.operations_dashboard_kpis(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contacted         int;
  v_scouter_contacts  int;
  v_scouter_generated int;
  v_numbers_obtained  int;
  v_closer_calls      int;
  v_closes            int;
  v_on_hold           int;
  v_rejections        int;
  v_entered_crm       int;
  v_leads_nuevas      int;
  v_leads_existentes  int;
  v_crm_mov           jsonb;
BEGIN
  SELECT COUNT(*) INTO v_contacted
  FROM leadgen_entries
  WHERE created_at >= p_from AND created_at <= p_to;

  SELECT
    COUNT(*) FILTER (WHERE record_type IS NULL OR record_type = 'nuevo'),
    COUNT(*) FILTER (WHERE record_type = 'reactivado')
  INTO v_leads_nuevas, v_leads_existentes
  FROM leadgen_entries
  WHERE created_at >= p_from AND created_at <= p_to;

  SELECT COUNT(*) INTO v_scouter_contacts
  FROM scouter_leads
  WHERE first_scouter_contact_at IS NOT NULL
    AND first_scouter_contact_at >= p_from
    AND first_scouter_contact_at <= p_to;

  SELECT COUNT(*) INTO v_scouter_generated
  FROM scouter_leads
  WHERE created_at >= p_from AND created_at <= p_to;

  SELECT COUNT(*) INTO v_numbers_obtained
  FROM v_model_phone_captures
  WHERE captured_at >= p_from AND captured_at <= p_to;

  SELECT COUNT(*) INTO v_closer_calls
  FROM qa_calls
  WHERE call_date >= p_from AND call_date <= p_to;

  SELECT COUNT(*) INTO v_closes
  FROM qa_calls
  WHERE call_date >= p_from AND call_date <= p_to
    AND claude_analysis->>'call_outcome' = 'cerro';

  SELECT COUNT(*) INTO v_on_hold
  FROM qa_calls
  WHERE call_date >= p_from AND call_date <= p_to
    AND claude_analysis->>'call_outcome' = 'en_espera';

  SELECT COUNT(*) INTO v_rejections
  FROM qa_calls
  WHERE call_date >= p_from AND call_date <= p_to
    AND claude_analysis->>'call_outcome' = 'no_cerro';

  SELECT COUNT(*) INTO v_entered_crm
  FROM creators
  WHERE entered_crm_at IS NOT NULL
    AND entered_crm_at >= p_from
    AND entered_crm_at <= p_to;

  v_crm_mov := crm_movements_in_range(p_from, p_to);

  RETURN jsonb_build_object(
    'contacted',         v_contacted,
    'scouterContacts',   v_scouter_contacts,
    'scouterGenerated',  v_scouter_generated,
    'numbersObtained',   v_numbers_obtained,
    'closerCalls',       v_closer_calls,
    'closes',            v_closes,
    'onHold',            v_on_hold,
    'rejections',        v_rejections,
    'enteredCrm',        v_entered_crm,
    'leadsNuevas',       v_leads_nuevas,
    'leadsExistentes',   v_leads_existentes,
    'crmAltas',          COALESCE((v_crm_mov->>'altas')::int, 0),
    'crmBajas',          COALESCE((v_crm_mov->>'bajas')::int, 0)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.blu_conciliacion(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_desde date := (current_date - greatest(1, least(p_dias, 400)));
  v_a jsonb; v_b jsonb; v_c jsonb;
  v_cuentas int; v_cuentas_vinc int;
  v_vinculadas int; v_sueltas int; v_sueltas_nuestras int; v_personas int;
  v_activas int; v_plus int; v_massive int; v_estado_viejo int; v_sin_facturar int;
begin
  if not coalesce(public.blu_is_management(auth.uid()), false) then
    raise exception 'forbidden: management only' using errcode = '42501';
  end if;

  -- A) sueltas, UNA FILA POR PERSONA, con la agencia que la trajo
  select coalesce(jsonb_agg(t order by t.bruto desc), '[]'::jsonb) into v_a
  from (
    select string_agg(distinct e.blu_creator_name, ' + ') as cuenta,
           count(distinct lower(trim(e.blu_creator_name))) as n_cuentas,
           round(sum(e.total_gross)) as bruto,
           count(distinct e.date) as dias,
           max(e.date)::text as ultimo_dia,
           max(a.agency) as agencia
    from public.creator_daily_earnings e
    left join public.blu_account_agency a on a.cuenta = lower(trim(e.blu_creator_name))
    where e.creator_id is null and e.date >= v_desde
      and not exists (
        select 1 from public.blu_creator_map m
        where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored')
    group by public.blu_persona_key(e.blu_creator_name)
    having sum(e.total_gross) > 0
  ) t;
  v_sueltas := jsonb_array_length(v_a);
  select count(*) into v_sueltas_nuestras
  from jsonb_array_elements(v_a) x where x->>'agencia' is not null;

  -- B) facturan con estado ≠ active (el perfil existe, pero no cuenta como roster)
  select coalesce(jsonb_agg(t order by t.bruto desc), '[]'::jsonb) into v_b
  from (
    select coalesce(nullif(trim(c.artistic_name),''), c.name) as creadora,
           c.status, coalesce(cb.kash_type,'—') as kash,
           string_agg(distinct e.blu_creator_name, ' + ') as cuentas,
           round(sum(e.total_gross)) as bruto,
           max(e.date)::text as ultimo_dia
    from public.creator_daily_earnings e
    join public.creators c on c.id = e.creator_id
    left join public.creator_business cb on cb.creator_id = c.id
    where e.date >= v_desde and c.status <> 'active'
    group by c.id, c.artistic_name, c.name, c.status, cb.kash_type
    having sum(e.total_gross) > 0
  ) t;
  v_estado_viejo := jsonb_array_length(v_b);

  -- C) activas en Maven que no facturaron
  select coalesce(jsonb_agg(t order by t.creadora), '[]'::jsonb) into v_c
  from (
    select coalesce(nullif(trim(c.artistic_name),''), c.name) as creadora,
           coalesce(cb.kash_type,'—') as kash
    from public.creators c
    left join public.creator_business cb on cb.creator_id = c.id
    where c.status = 'active'
      and not exists (select 1 from public.creator_daily_earnings e
                       where e.creator_id = c.id and e.date >= v_desde
                         and e.total_gross > 0)
  ) t;
  v_sin_facturar := jsonb_array_length(v_c);

  -- Cuentas (para el detalle) y creadoras VINCULADAS que facturaron
  select count(*), count(*) filter (where cid is not null),
         count(distinct cid) filter (where bruto > 0)
    into v_cuentas, v_cuentas_vinc, v_vinculadas
  from (
    select max(e.creator_id::text) as cid, sum(e.total_gross) as bruto
    from public.creator_daily_earnings e
    where e.date >= v_desde
      and not exists (
        select 1 from public.blu_creator_map m
        where lower(trim(m.blu_name)) = lower(trim(e.blu_creator_name)) and m.status = 'ignored')
    group by lower(trim(e.blu_creator_name))
  ) x;

  v_personas := v_vinculadas + v_sueltas;

  select count(*),
         count(*) filter (where cb.kash_type = 'Plus'),
         count(*) filter (where cb.kash_type = 'Massive')
    into v_activas, v_plus, v_massive
  from public.creators c
  left join public.creator_business cb on cb.creator_id = c.id
  where c.status = 'active';

  return jsonb_build_object(
    'desde', v_desde,
    'blu_personas', v_personas,
    'blu_vinculadas', v_vinculadas,
    'blu_sin_vincular', v_sueltas,
    'blu_sueltas_con_agencia', v_sueltas_nuestras,
    'blu_cuentas', v_cuentas,
    'blu_cuentas_vinculadas', v_cuentas_vinc,
    'maven_activas', v_activas,
    'maven_plus', v_plus,
    'maven_massive', v_massive,
    'estado_viejo', v_estado_viejo,
    'activas_sin_facturar', v_sin_facturar,
    'cuadra', (v_personas = v_activas and v_sueltas = 0
               and v_estado_viejo = 0 and v_sin_facturar = 0),
    'sin_vincular', v_a,
    'facturan_sin_estar_activas', v_b,
    'activas_sin_blu', v_c);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_creator_scan_config(p_tenant uuid, p_query text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (select regexp_replace(lower(trim(p_query)), '^@', '') as h),
  c as (
    select cr.id, coalesce(nullif(cr.artistic_name,''), cr.name) as creadora, cr.status,
           cr.instagram_handle, cr.telegram_handle, cr.twitter_handle, cr.facebook_handle
    from creators cr, q
    where lower(cr.instagram_handle) = q.h
       or coalesce(cr.artistic_name, cr.name) ilike '%'||p_query||'%'
       or cr.name ilike '%'||p_query||'%'
    order by (lower(cr.instagram_handle) = q.h) desc, (cr.status='active') desc
    limit 1
  ),
  health as (
    select lower(pe.network) as red,
           coalesce(nullif(lower(pe.source_handle),''), '(principal)') as handle,
           to_char(max(pe.dia),'DD/MM') as ultimo_scan,
           count(*) filter (where pe.promoted in ('true','yes','partial')) as promos_14d,
           count(distinct pe.dia) filter (where coalesce(pe.promoted,'') <> 'pending') as dias_leidos,
           (array_agg(pe.error_reason order by pe.date desc) filter (where pe.error_reason is not null))[1] as ultimo_error
    from promolog_entries pe join c on c.id = pe.creator_id
    where pe.dia > (now() at time zone 'America/Bogota')::date - 14
    group by lower(pe.network), coalesce(nullif(lower(pe.source_handle),''), '(principal)')
  )
  select jsonb_build_object(
    'creadora', c.creadora,
    'status', c.status,
    'handles_cargados', jsonb_strip_nulls(jsonb_build_object(
      'instagram', c.instagram_handle,
      'telegram', c.telegram_handle,
      'x_twitter', c.twitter_handle,
      'facebook', c.facebook_handle)),
    'telegram_apunta_a', case
       when c.telegram_handle is null then 'no cargado'
       when c.telegram_handle ~ 't\.me/m/' then 'deeplink de MENSAJE (mal — no es un canal)'
       when c.telegram_handle ~ 't\.me/\+' then 'link de invitación a canal (ok)'
       when c.telegram_handle ~ 't\.me/' then 'canal público por link (ok)'
       else 'username suelto "'||c.telegram_handle||'" (puede apuntar a un USUARIO, no a un canal — verificar)' end,
    'cuentas_secundarias', (select jsonb_agg(jsonb_build_object('red', lower(csa.network), 'user', csa.username, 'activa', csa.active) order by lower(csa.network))
                             from creator_social_accounts csa where csa.creator_id = c.id),
    'salud_scan_14d', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'red', red, 'handle', handle, 'ultimo_scan', ultimo_scan,
        'dias_leidos', dias_leidos, 'promos_14d', promos_14d,
        'ultimo_error', ultimo_error,
        'ultimo_error_explicado', case
          when ultimo_error is null then null
          when ultimo_error = 'throttled' then
            'la red limitó NUESTRA sesión de scan (rate limit). Problema del SCANNER, no de la cuenta de la creadora — PROHIBIDO decir que su cuenta tiene problemas por esto.'
          when ultimo_error = 'read_failed' then
            'fallo de lectura de NUESTRO scanner. No implica nada sobre la cuenta de la creadora.'
          when ultimo_error = 'no_session' then
            'nuestro scanner no tiene sesión activa para esa red (lado nuestro).'
          when ultimo_error = 'unconfirmed_empty' then
            'se vio vacío pero la sesión no había demostrado poder leer — NO concluyente (lado nuestro), no cuenta como "no promocionó".'
          when ultimo_error like 'json_parse%' then
            'error interno del clasificador (lado nuestro).'
          when ultimo_error = 'follow_pending' then
            'nuestra cuenta scanner aún no sigue a la creadora (o la solicitud está pendiente). Accionable: aceptar/seguir.'
          when ultimo_error in ('no_ig_id','handle_not_found') then
            'el handle NO RESUELVE en la red: probablemente cambió o está mal cargado en Maven. Accionable: corregir el handle.'
          when ultimo_error in ('privada','private','requires_follow') then
            'la cuenta es PRIVADA: hay que seguirla para leerla. Accionable: enviar solicitud.'
          else
            'código interno del scan. Por defecto tratarlo como fallo de LECTURA nuestro, NO como problema de la cuenta de la creadora.'
        end)) order by red)
      from health),
    'nota', 'Números/promo por red de los últimos 14 días CON su cobertura. dias_leidos parciales o ultimo_error presente ⇒ la frase correcta es "no la estamos leyendo", NUNCA "no promocionó" ni "su cuenta tiene problemas". Quién tiene el problema lo dice ultimo_error_explicado (la mayoría son fallos de NUESTRO scanner). Si una red no aparece en salud_scan ni en handles_cargados, no está cargada.'
  )
  from c;
$function$
;

CREATE OR REPLACE FUNCTION public.get_creator_top_fans(p_tenant uuid, p_query text, p_limit integer DEFAULT 10, p_period text DEFAULT 'auto'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with c as (
    select cr.id, coalesce(nullif(cr.artistic_name,''), cr.name) as creadora
    from creators cr
    where lower(cr.instagram_handle) = regexp_replace(lower(trim(p_query)),'^@','')
       or coalesce(cr.artistic_name, cr.name) ilike '%'||p_query||'%'
       or cr.name ilike '%'||p_query||'%'
    order by (lower(cr.instagram_handle) = regexp_replace(lower(trim(p_query)),'^@','')) desc,
             (cr.status='active') desc
    limit 1
  ),
  disponibles as (
    select coalesce(jsonb_agg(distinct f.period_kind), '[]'::jsonb) as kinds
    from creator_top_fans f, c where f.creator_id = c.id
  ),
  elegido as (
    select f.period_kind
    from creator_top_fans f, c
    where f.creator_id = c.id
      and (lower(coalesce(p_period,'auto')) = 'auto' or f.period_kind = lower(p_period))
    group by f.period_kind
    order by case f.period_kind when 'alltime' then 1 when 'month' then 2 else 3 end
    limit 1
  ),
  fans as (
    select f.* from creator_top_fans f, c, elegido
    where f.creator_id = c.id and f.period_kind = elegido.period_kind
  ),
  ranked as (
    select row_number() over (order by spent_gross desc nulls last) as puesto, *
    from fans order by spent_gross desc nulls last
    limit greatest(1, least(coalesce(p_limit,10), 25))
  )
  select case
    when not exists (select 1 from elegido) then jsonb_build_object(
      'creadora', c.creadora,
      'periodo_pedido', lower(coalesce(p_period,'auto')),
      'sin_datos', true,
      'periodos_disponibles', (select kinds from disponibles),
      'nota', 'No hay top-fans importados para ese período. Dilo tal cual — NO uses otro período como si fuera el pedido. El histórico (alltime) y el mensual los trae el blu-bridge en su corrida pesada.')
    else jsonb_build_object(
      'creadora', c.creadora,
      'periodo', (select period_kind from elegido),
      'ventana', (select to_char(min(snapshot_from),'DD/MM/YY')||' al '||to_char(max(snapshot_to),'DD/MM/YY') from fans),
      'dias_de_la_ventana', (select (max(snapshot_to) - min(snapshot_from)) + 1 from fans),
      'periodos_disponibles', (select kinds from disponibles),
      'top_fans', coalesce((
        select jsonb_agg(jsonb_build_object(
          'puesto', r.puesto,
          'fan', coalesce(nullif(r.fan_name,''), r.fan_username),
          'gasto_usd', round(r.spent_gross), 'transacciones', r.transactions,
          'ppv_usd', round(coalesce(r.ppv_gross,0)), 'tips_usd', round(coalesce(r.tips_gross,0)),
          'suscripciones_usd', round(coalesce(r.subscriptions_gross,0)),
          'activo', r.is_active, 'dias_suscripto', r.subscription_length_days) order by r.puesto)
        from ranked r), '[]'::jsonb),
      'concentracion', (select jsonb_build_object(
          'fans_en_el_periodo', count(*),
          'gasto_total_usd', round(coalesce(sum(spent_gross),0)),
          'top3_pct', case when coalesce(sum(spent_gross),0) > 0 then
              round(100.0 * (select coalesce(sum(spent_gross),0)
                               from (select spent_gross from fans order by spent_gross desc nulls last limit 3) x)
                    / sum(spent_gross)) else null end)
          from fans),
      'nota', 'alltime = histórico completo · month = mes en curso · window = snapshot suelto de un sync. Di SIEMPRE de qué período hablas; si la ventana es corta, aclara que los montos no representan el mes.')
  end
  from c;
$function$
;

CREATE OR REPLACE FUNCTION public.get_manager_contact_stats(p_from date, p_to date, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS TABLE(creator_id uuid, name text, instagram_handle text, manager_profile_id uuid, phone_ok boolean, last_contact_at timestamp with time zone, contact_days_in_range integer, msgs_in_range integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (
    coalesce(current_setting('request.jwt.claims', true), '') = ''
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid() and ur.role in ('admin','manager','owner'))
  ) then
    raise exception 'forbidden: métricas de managers solo para management' using errcode = '42501';
  end if;

  return query
  with mgr_lines as (
    select ch.id from public.wa_channels ch
    where ch.department = 'manager' and ch.active
      and (p_tenant is null or ch.tenant_id = p_tenant)
  ),
  outbound as (
    select right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),10) as d10,
           msg.sent_at,
           ((msg.sent_at at time zone 'America/Bogota')::date) as dia_bog
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id
     and msg.deleted_at is null
     and msg.direction = 'out'
     and coalesce(msg.status,'') <> 'failed'
    where conv.channel_id in (select id from mgr_lines)
  ),
  per_phone as (
    select d10,
           max(sent_at) as last_out_at,
           count(distinct dia_bog) filter (where dia_bog between p_from and p_to)::int as contact_days,
           count(*) filter (where dia_bog between p_from and p_to)::int as msgs
    from outbound
    group by d10
  ),
  models as (
    select c.id,
           coalesce(nullif(c.artistic_name,''), c.name) as cname,
           c.instagram_handle as ig,
           c.assigned_manager_profile_id as mgr,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),10) as d10
    from public.creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  )
  select m.id, m.cname, m.ig, m.mgr,
         (length(m.d10) = 10) as phone_ok,
         pp.last_out_at,
         coalesce(pp.contact_days, 0),
         coalesce(pp.msgs, 0)
  from models m
  left join per_phone pp on length(m.d10) = 10 and pp.d10 = m.d10;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_manager_growth_stats(p_from date, p_to date, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS TABLE(creator_id uuid, name text, instagram_handle text, manager_profile_id uuid, new_fans integer, new_sub_gross numeric, recurring_sub_gross numeric, total_gross numeric, prev_new_fans integer, prev_new_sub_gross numeric, prev_total_gross numeric, days_with_data integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_len int := (p_to - p_from) + 1;
  v_prev_from date := p_from - v_len;
  v_prev_to date := p_from - 1;
begin
  if not (
    coalesce(current_setting('request.jwt.claims', true), '') = ''
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid() and ur.role in ('admin','manager','owner'))
  ) then
    raise exception 'forbidden: métricas de managers solo para management' using errcode = '42501';
  end if;

  return query
  with models as (
    select c.id,
           coalesce(nullif(c.artistic_name,''), c.name) as cname,
           c.instagram_handle as ig,
           c.assigned_manager_profile_id as mgr
    from public.creators c
    where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  cur as (
    select e.creator_id,
           sum(coalesce(e.new_fans,0))::int as new_fans,
           sum(coalesce(e.new_sub_gross,0)) as new_sub,
           sum(coalesce(e.recurring_sub_gross,0)) as rec_sub,
           sum(coalesce(e.total_gross,0)) as total,
           count(distinct e.date)::int as days_with_data
    from public.creator_daily_earnings e
    where e.date between p_from and p_to
      and (p_tenant is null or e.tenant_id = p_tenant)
    group by e.creator_id
  ),
  prev as (
    select e.creator_id,
           sum(coalesce(e.new_fans,0))::int as new_fans,
           sum(coalesce(e.new_sub_gross,0)) as new_sub,
           sum(coalesce(e.total_gross,0)) as total
    from public.creator_daily_earnings e
    where e.date between v_prev_from and v_prev_to
      and (p_tenant is null or e.tenant_id = p_tenant)
    group by e.creator_id
  )
  select m.id, m.cname, m.ig, m.mgr,
         coalesce(cur.new_fans, 0),
         coalesce(cur.new_sub, 0),
         coalesce(cur.rec_sub, 0),
         coalesce(cur.total, 0),
         coalesce(prev.new_fans, 0),
         coalesce(prev.new_sub, 0),
         coalesce(prev.total, 0),
         coalesce(cur.days_with_data, 0)
  from models m
  left join cur on cur.creator_id = m.id
  left join prev on prev.creator_id = m.id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.corte_cierre_prep(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tenant uuid := '30869615-f579-4981-8a1f-dbebc61eae2d';
  v_hoy date := (now() at time zone 'America/Bogota')::date;
  v_ini timestamptz := (now() at time zone 'America/Bogota')::date::timestamp at time zone 'America/Bogota';
  v_es_viernes boolean := extract(dow from (now() at time zone 'America/Bogota'))::int = 5;
  v_es_sabado boolean := extract(dow from (now() at time zone 'America/Bogota'))::int = 6;
  v_fr_max int;
  v_hub_ref numeric;
  v_personas jsonb;
  v_equipo numeric;
  v_empresa numeric;
  v_semana jsonb;
begin
  v_fr_max := case when v_es_sabado then 2 else 5 end;
  v_hub_ref := case when v_es_sabado then 3.5 else 7.0 end;

  with grupos_corte as (
    select unnest(array[
      'a12d9f41-c962-4d98-b0bb-6b2d2573534c',
      '73a4414e-2546-4ca7-9289-7cbec70b0273',
      'd12ec56f-b324-4369-b72d-7540fb930ef6'
    ]::uuid[]) as gid
  ),
  todos_miembros as (
    select g.gid as group_id, p.id as pid,
           split_part(coalesce(nullif(p.full_name,''), min(m.display_name)),' ',1) as nombre,
           min(m.created_at) as member_since
    from grupos_corte g
    join whatsapp_members m on m.group_id = g.gid and coalesce(m.active, true)
    join profiles p on p.id = m.user_id
    where not public.has_role(p.id, 'admin'::app_role)
      and p.id not in (select profile_id from public.corte_notas_excluidos)
    group by 1, 2, p.full_name
  ),
  habla as (
    select w.group_id, mm.user_id as pid, count(*) as msgs
    from whatsapp_messages w
    join whatsapp_members mm on mm.group_id = w.group_id and mm.external_id = w.sender_external_id
    where w.group_id in (select gid from grupos_corte)
      and w.is_from_bot = false and w.sent_at >= v_ini
      and length(coalesce(nullif(w.body,''), w.transcribed_text, '')) > 15
    group by 1, 2
  ),
  casa as (
    select pid, group_id from (
      select tm.pid, tm.group_id,
             row_number() over (
               partition by tm.pid
               order by coalesce(h.msgs, 0) desc, tm.member_since asc, tm.group_id
             ) as rn
      from todos_miembros tm
      left join habla h on h.pid = tm.pid and h.group_id = tm.group_id
    ) z where rn = 1
  ),
  miembros as (
    select tm.group_id, tm.pid, tm.nombre
    from todos_miembros tm join casa c on c.pid = tm.pid and c.group_id = tm.group_id
  ),
  msgs as (
    select mi.pid,
           count(*) filter (where length(coalesce(nullif(w.body,''), w.transcribed_text, '')) > 15) as msgs_dia,
           count(distinct least(floor((extract(epoch from (w.sent_at at time zone 'America/Bogota') - v_hoy::timestamp) / 3600 - 10) / 2), v_fr_max - 1))
             filter (where (w.sent_at at time zone 'America/Bogota')::time between time '10:00' and time '19:00'
                       and length(coalesce(nullif(w.body,''), w.transcribed_text, '')) > 15) as franjas
    from miembros mi
    join whatsapp_members mm on mm.group_id = mi.group_id and mm.user_id = mi.pid
    join whatsapp_messages w on w.group_id = mi.group_id and w.sender_external_id = mm.external_id
      and w.is_from_bot = false and w.sent_at >= v_ini
    group by 1
  ),
  hub as (
    select hm.profile_id as pid,
           round(coalesce(sum(a.tracked_seconds),0) / 3600.0, 1) as horas,
           round(sum(a.overall_activity * a.tracked_seconds) filter (where a.overall_activity is not null)
                 / nullif(sum(a.tracked_seconds) filter (where a.overall_activity is not null), 0))::int as act
    from hubstaff_members hm
    join hubstaff_activities a on a.member_id = hm.id and a.starts_at >= v_ini
    group by 1
  ),
  rep as (
    select r.user_id as pid, r.contactados, r.respuestas, r.numeros_obtenidos,
           coalesce(r.videos_creados,0) + coalesce(r.fotos_creadas,0) as piezas,
           coalesce(r.posts_subidos,0) as posts, coalesce(r.cuentas_creadas,0) as cuentas
    from whatsapp_daily_reports r where r.report_date = v_hoy
  ),
  extra as (
    select mi.pid,
      (select count(*) from closers_contacts cc where cc.created_by = mi.pid and cc.phone is not null and cc.created_at >= v_ini) as numeros_maven,
      (select count(*) from closer_contact_history ch where ch.created_by = mi.pid and ch.created_at >= v_ini) as gestiones,
      (select count(*) from leadgen_entries le where le.lg_user_id = mi.pid and le.created_at >= v_ini) as perfiles,
      (select count(*) from closer_creators cc2 where cc2.assigned_to = mi.pid and cc2.confirmed_date >= v_ini) as confirmadas_hoy,
      (select count(*) from closer_creators cc3 where cc3.assigned_to = mi.pid and cc3.completed_date >= v_ini) as completadas_hoy,
      (select count(*) from monetization_opportunities mo where mo.assigned_to = mi.pid and mo.stage='won' and mo.won_at >= v_ini) as ventas_won_hoy
    from miembros mi
  ),
  linea as (select id from wa_channels where department='manager' and coalesce(active, true)),
  convs as (select id, contact_id from wa_conversations where channel_id in (select id from linea) and contact_id is not null),
  sal as (
    select c.contact_id, count(*)::int as msgs
    from wa_conversation_messages wm join convs c on c.id = wm.conversation_id
    where wm.direction = 'out' and wm.deleted_at is null and coalesce(wm.status,'') <> 'failed'
      and wm.sent_at >= v_ini
    group by 1
  ),
  cr_phone as (
    select cr.id, cr.assigned_manager_profile_id,
           right(public.canonical_phone(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone)), 10) as key10,
           right(regexp_replace(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone, ''), '\D', '', 'g'), 8) as key8
    from creators cr where cr.status = 'active'
  ),
  cr10 as (
    select distinct on (key10) key10, id from cr_phone where length(key10) = 10
    order by key10, (assigned_manager_profile_id is null)
  ),
  cr8 as (
    select key8, min(id::text)::uuid as id from cr_phone where length(key8) = 8
    group by key8 having count(distinct id) = 1
  ),
  matched as (
    select s.msgs, coalesce(c10.id, c8.id) as creator_id
    from sal s join wa_contacts ct on ct.id = s.contact_id
    left join cr10 c10 on c10.key10 = right(public.canonical_phone(ct.phone_e164), 10)
    left join cr8 c8 on c10.id is null and c8.key8 = right(regexp_replace(coalesce(ct.phone_e164,''), '\D', '', 'g'), 8)
  ),
  contactadas_mgr as (
    select split_part(coalesce(p.full_name,'-'),' ',1) as mgr,
           count(distinct m.creator_id)::int as contactadas
    from matched m
    join creators cr on cr.id = m.creator_id
    left join creator_business cb on cb.creator_id = m.creator_id
    left join profiles p on p.id = cr.assigned_manager_profile_id
    where m.creator_id is not null
    group by 1
  ),
  promos_mgr as (
    select split_part(p.full_name,' ',1) as mgr,
           count(*)::int as roster,
           count(*) filter (where exists (
             select 1 from promolog_entries e
             where e.creator_id = c.id and e.tenant_id = v_tenant
               and e.dia = v_hoy and e.promoted = 'true'))::int as con_promo
    from creators c join profiles p on p.id = c.assigned_manager_profile_id
    where c.status = 'active' group by 1
  ),
  calc as (
    select mi.group_id, mi.pid, mi.nombre,
      ob.metrica as objetivo, coalesce(ob.meta_diaria, 1) as meta,
      coalesce(ms.franjas, 0)::int as franjas,
      coalesce(ms.msgs_dia, 0)::int as msgs_dia,
      case when exists (select 1 from hubstaff_members hmx where hmx.profile_id = mi.pid)
        then coalesce(h.horas, 0) end as hub_h,
      h.act as hub_act,
      r.contactados, r.respuestas, r.numeros_obtenidos, coalesce(r.piezas,0) as piezas,
      coalesce(r.posts,0) as posts,
      x.numeros_maven, x.gestiones, x.perfiles, x.confirmadas_hoy, x.completadas_hoy, x.ventas_won_hoy,
      cm.contactadas, pm.roster, pm.con_promo,
      case
        when ob.metrica = 'numeros' then
          0.75 * least(coalesce(x.numeros_maven,0)::numeric
                       / nullif(ob.meta_diaria,0), 1)
          + 0.25 * greatest(
              least(coalesce(r.contactados,0) / 60.0, 1),
              least((coalesce(r.piezas,0) + coalesce(r.posts,0)) / 6.0, 1))
        when ob.metrica = 'contenido' then
          least((coalesce(r.piezas,0) + coalesce(r.posts,0))::numeric / nullif(ob.meta_diaria,0), 1)
        when ob.metrica = 'cierres' then
          case when x.ventas_won_hoy > 0 then 1.0
               when x.confirmadas_hoy > 0 or x.completadas_hoy > 0 then 0.85
               else 0.7 * least(coalesce(x.gestiones,0) / 15.0, 1) end
        when ob.metrica = 'promo' then
          0.2 * least(coalesce(cm.contactadas,0) / 8.0, 1)
          + 0.8 * (coalesce(pm.con_promo,0)::numeric / nullif(pm.roster,0))
        when ob.metrica = 'ninguna' then null
        when pm.roster is not null then
          0.2 * least(coalesce(cm.contactadas,0) / 8.0, 1) + 0.8 * (pm.con_promo::numeric / nullif(pm.roster,0))
        when x.ventas_won_hoy > 0 then 1.0
        when x.confirmadas_hoy > 0 or x.completadas_hoy > 0 then 0.85
        when coalesce(r.numeros_obtenidos, x.numeros_maven, 0) > 0 or coalesce(r.contactados,0) > 0 then
          0.6 * least(greatest(coalesce(r.numeros_obtenidos,0), x.numeros_maven) / 3.0, 1)
          + 0.4 * least(coalesce(r.contactados,0) / 60.0, 1)
        when x.gestiones >= 3 then 0.7 * least(x.gestiones / 15.0, 1)
        when coalesce(r.piezas,0) + coalesce(r.posts,0) > 0 then
          least((coalesce(r.piezas,0) + coalesce(r.posts,0)) / 6.0, 1)
        when x.perfiles > 0 then least(x.perfiles / 15.0, 1)
        else null
      end as avance
    from miembros mi
    left join corte_objetivos ob on ob.profile_id = mi.pid
    left join msgs ms on ms.pid = mi.pid
    left join hub h on h.pid = mi.pid
    left join rep r on r.pid = mi.pid
    left join extra x on x.pid = mi.pid
    left join contactadas_mgr cm on cm.mgr = mi.nombre
    left join promos_mgr pm on pm.mgr = mi.nombre
  ),
  notas as (
    select c.*,
      corte_nota_formula(c.franjas, v_fr_max, c.hub_h, v_hub_ref, c.hub_act, c.avance) as nota_sugerida,
      (c.avance is null) as sin_metricas_tabla
    from calc c
  ),
  limpiadas as (
    delete from corte_notas cn
    using casa c
    where cn.fecha = v_hoy and cn.profile_id = c.pid and cn.group_id <> c.group_id
      and cn.group_id in (select gid from grupos_corte)
    returning cn.profile_id
  ),
  guardadas as (
    insert into corte_notas (fecha, group_id, profile_id, nombre, nota_sugerida, componentes)
    select v_hoy, n.group_id, n.pid, n.nombre, n.nota_sugerida,
      jsonb_strip_nulls(jsonb_build_object(
        'franjas', n.franjas, 'franjas_max', v_fr_max, 'msgs_dia', n.msgs_dia,
        'hub_h', n.hub_h, 'hub_act', n.hub_act,
        'sin_cuenta_hubstaff', case when n.hub_h is null then true else null end,
        'textos', n.contactados, 'respuestas', n.respuestas,
        'objetivo', n.objetivo,
        'numeros', case when coalesce(n.objetivo,'numeros') <> 'numeros' or n.sin_metricas_tabla then null
                        else greatest(coalesce(n.numeros_obtenidos,0), coalesce(n.numeros_maven,0)) end,
        'numeros_auto_reportados', case when coalesce(n.objetivo,'numeros') = 'numeros'
                                          and coalesce(n.numeros_obtenidos,0) > coalesce(n.numeros_maven,0)
                                        then n.numeros_obtenidos end,
        'gestiones', nullif(n.gestiones,0),
        'perfiles', nullif(n.perfiles,0), 'piezas', nullif(n.piezas,0), 'posts', nullif(n.posts,0),
        'contactadas', n.contactadas, 'roster', n.roster, 'promos_roster', n.con_promo,
        'confirmadas', nullif(n.confirmadas_hoy,0), 'completadas', nullif(n.completadas_hoy,0),
        'ventas_won', nullif(n.ventas_won_hoy,0),
        'sin_metricas_tabla', case when n.sin_metricas_tabla then true else null end))
    from notas n
    on conflict (fecha, group_id, profile_id) do update
      set nota_sugerida = excluded.nota_sugerida, componentes = excluded.componentes, nombre = excluded.nombre
    returning group_id, profile_id, nombre, nota_sugerida, componentes
  )
  select
    jsonb_agg(jsonb_build_object('nombre', g.nombre, 'nota_sugerida', g.nota_sugerida, 'insumos', g.componentes)
              order by g.nota_sugerida desc nulls last) filter (where g.group_id = p_group_id),
    round(avg(g.nota_sugerida) filter (where g.group_id = p_group_id), 1),
    round(avg(g.nota_sugerida), 1)
  into v_personas, v_equipo, v_empresa
  from guardadas g;

  if v_es_viernes then
    select jsonb_agg(jsonb_build_object('nombre', s.nombre, 'promedio_7d', s.prom, 'dias_con_nota', s.dias, 'mejor', s.mejor, 'peor', s.peor)
                     order by s.prom desc)
    into v_semana
    from (
      select cn.nombre, round(avg(cn.nota_sugerida), 1) as prom, count(*) as dias,
             max(cn.nota_sugerida) as mejor, min(cn.nota_sugerida) as peor
      from corte_notas cn
      where cn.group_id = p_group_id and cn.fecha > v_hoy - 7
      group by cn.nombre
    ) s;
  end if;

  return jsonb_build_object(
    'personas', coalesce(v_personas, '[]'::jsonb),
    'equipo_promedio', v_equipo,
    'empresa_promedio', v_empresa,
    'semana', v_semana
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_manager_roster_stats(p_tenant uuid, p_date date DEFAULT NULL::date)
 RETURNS TABLE(manager_profile_id uuid, manager_name text, kash_types text, effective_date date, is_partial_day boolean, total_active integer, scannable_count integer, reachable_count integer, covered_count integer, promoted_count integer, promoted_pct numeric, contacted_count integer, contacted_pct numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with d as (
    select coalesce(p_date, (now() at time zone 'America/Bogota')::date) as day,
           (now() at time zone 'America/Bogota')::date as today_bog
  ),
  roster as (
    select c.id,
           c.assigned_manager_profile_id as mgr,
           cb.kash_type,
           (coalesce(nullif(trim(c.instagram_handle),''), nullif(trim(c.telegram_handle),'')) is not null) as scannable,
           right(public.canonical_phone(coalesce(c.phone_e164, c.whatsapp_number, c.phone)),10) as k10,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),8) as k8
    from public.creators c
    left join public.creator_business cb on cb.creator_id = c.id
    where c.status = 'active'
  ),
  promo as (
    select e.creator_id,
      bool_or(e.promoted in ('true','yes','partial')) as promoted,
      bool_or(coalesce(e.promoted,'') <> 'pending') as covered
    from public.promolog_entries e cross join d
    where e.tenant_id = p_tenant
      and e.dia = d.day
    group by 1
  ),
  mgr_lines as (
    select id from public.wa_channels
    where tenant_id = p_tenant and department = 'manager' and active
  ),
  contact_out as (
    select right(public.canonical_phone(ct.phone_e164),10) as k10,
           right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),8) as k8
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id and msg.deleted_at is null
         and msg.direction = 'out' and coalesce(msg.status,'') <> 'failed'
    cross join d
    where conv.channel_id in (select id from mgr_lines)
      and msg.sent_at >= (d.day::timestamp at time zone 'America/Bogota')
      and msg.sent_at <  ((d.day + 1)::timestamp at time zone 'America/Bogota')
    group by 1, 2
  ),
  by_canon as (select k10 from contact_out where length(k10) = 10 group by k10),
  by_k8 as (select k8, count(distinct k10) as n_canon from contact_out where length(k8) = 8 group by k8),
  roster_k8 as (select k8, count(*) as n_roster from roster where length(k8) = 8 group by k8),
  resolved as (
    select r.mgr, r.kash_type, r.scannable,
      (length(r.k10) = 10 or length(r.k8) = 8) as reachable,
      coalesce(p.promoted, false) as promoted,
      coalesce(p.covered, false) as covered,
      (
        exists (select 1 from by_canon bc where length(r.k10) = 10 and bc.k10 = r.k10)
        or exists (
          select 1 from by_k8 bk join roster_k8 rk on rk.k8 = bk.k8
          where length(r.k8) = 8 and bk.k8 = r.k8 and bk.n_canon = 1 and rk.n_roster = 1
        )
      ) as contacted
    from roster r
    left join promo p on p.creator_id = r.id
  )
  select r.mgr,
         m.full_name,
         string_agg(distinct r.kash_type, '/' order by r.kash_type),
         (select day from d),
         (select day = today_bog from d),
         count(*)::int,
         count(*) filter (where r.scannable)::int,
         count(*) filter (where r.reachable)::int,
         count(*) filter (where r.covered)::int,
         count(*) filter (where r.promoted)::int,
         round(100.0 * count(*) filter (where r.promoted) / nullif(count(*), 0)),
         count(*) filter (where r.contacted)::int,
         round(100.0 * count(*) filter (where r.contacted) / nullif(count(*) filter (where r.reachable), 0))
  from resolved r
  left join public.profiles m on m.id = r.mgr
  group by r.mgr, m.full_name
  order by m.full_name nulls last;
$function$
;

CREATE OR REPLACE FUNCTION public.get_manager_silent_creators(p_tenant uuid, p_days integer DEFAULT 3)
 RETURNS TABLE(creator_id uuid, name text, instagram_handle text, manager_profile_id uuid, manager_name text, last_contact_at timestamp with time zone, days_since_contact integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mgr_lines as (
    select id from public.wa_channels where tenant_id = p_tenant and department = 'manager' and active
  ),
  contact_out as (
    select right(public.canonical_phone(ct.phone_e164),10) as k10,
           right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),8) as k8,
           max(msg.sent_at) as last_out
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg
      on msg.conversation_id = conv.id and msg.deleted_at is null and msg.direction = 'out' and coalesce(msg.status,'') <> 'failed'
    where conv.channel_id in (select id from mgr_lines)
    group by 1, 2
  ),
  by_canon as (select k10, max(last_out) as last_out from contact_out where length(k10) = 10 group by k10),
  by_k8 as (select k8, count(distinct k10) as n_canon, max(last_out) as last_out from contact_out where length(k8) = 8 group by k8),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.assigned_manager_profile_id as mgr,
           right(public.canonical_phone(coalesce(c.phone_e164, c.whatsapp_number, c.phone)),10) as k10,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),8) as k8
    from public.creators c where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  resolved as (
    select a.id, a.name, a.instagram_handle, a.mgr,
           coalesce(
             (select bc.last_out from by_canon bc where length(a.k10) = 10 and bc.k10 = a.k10),
             (select bk.last_out from by_k8 bk where length(a.k8) = 8 and bk.k8 = a.k8 and bk.n_canon = 1)
           ) as last_out
    from active_models a where length(a.k10) = 10
  )
  select r.id, r.name, r.instagram_handle, r.mgr, m.full_name,
         r.last_out as last_contact_at,
         case when r.last_out is null then null else extract(day from (now() - r.last_out))::int end as days_since_contact
  from resolved r left join public.profiles m on m.id = r.mgr
  where r.last_out is null or r.last_out < now() - make_interval(days => p_days)
  order by m.full_name nulls last, r.last_out asc nulls first;
$function$
;

CREATE OR REPLACE FUNCTION public.get_manager_silent_no_promo(p_tenant uuid, p_days integer DEFAULT 3, p_low_promo_rate numeric DEFAULT 0.40)
 RETURNS TABLE(creator_id uuid, name text, instagram_handle text, manager_profile_id uuid, manager_name text, manager_phone text, promo_days integer, mtd_day integer, days_since_contact integer, last_contact_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bounds as (select date_trunc('month', (now() at time zone 'America/Bogota')::date)::date as this_start, extract(day from (now() at time zone 'America/Bogota')::date)::int as mtd_day),
  mgr_lines as (select id from public.wa_channels where tenant_id = p_tenant and department = 'manager' and active),
  contact_out as (
    select right(public.canonical_phone(ct.phone_e164),10) as k10,
           right(regexp_replace(coalesce(ct.phone_e164,''),'\D','','g'),8) as k8,
           max(msg.sent_at) as last_out
    from public.wa_conversations conv
    join public.wa_contacts ct on ct.id = conv.contact_id
    join public.wa_conversation_messages msg on msg.conversation_id = conv.id and msg.deleted_at is null and msg.direction = 'out'
    where conv.channel_id in (select id from mgr_lines)
    group by 1, 2
  ),
  by_canon as (select k10, max(last_out) as last_out from contact_out where length(k10) = 10 group by k10),
  by_k8 as (select k8, count(distinct k10) as n_canon, max(last_out) as last_out from contact_out where length(k8) = 8 group by k8),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           c.assigned_manager_profile_id as mgr,
           right(public.canonical_phone(coalesce(c.phone_e164, c.whatsapp_number, c.phone)),10) as k10,
           right(regexp_replace(coalesce(c.phone_e164, c.whatsapp_number, c.phone, ''),'\D','','g'),8) as k8
    from public.creators c where c.status = 'active' and c.assigned_manager_profile_id is not null
  ),
  promo as (
    -- promo_days incluye 'partial' (antes quedaba afuera y subcontaba la promo real).
    -- covered_days = días efectivamente LEÍDOS (excluye 'pending' = scan fallido), que
    -- es el denominador honesto: un día que no se pudo leer no prueba que no promocionó.
    select e.creator_id,
           count(distinct e.dia) filter (where e.promoted in ('true','yes','partial')) as promo_days,
           count(distinct e.dia) filter (where e.promoted in ('true','yes','partial','false')) as covered_days
    from public.promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.dia >= b.this_start group by e.creator_id
  ),
  resolved as (
    select a.id, a.name, a.instagram_handle, a.mgr,
      coalesce(
        (select bc.last_out from by_canon bc where length(a.k10) = 10 and bc.k10 = a.k10),
        (select bk.last_out from by_k8 bk where length(a.k8) = 8 and bk.k8 = a.k8 and bk.n_canon = 1)
      ) as last_out
    from active_models a where length(a.k10) = 10
  )
  select r.id, r.name, r.instagram_handle, r.mgr, m.full_name, m.phone_e164,
         coalesce(p.promo_days, 0)::int as promo_days,
         -- se devuelve en la columna mtd_day para no tocar el TS que la imprime: ahora
         -- el "x/y" del mensaje muestra días LEÍDOS, que es contra lo que se compara.
         coalesce(p.covered_days, 0)::int as mtd_day,
         extract(day from (now() - r.last_out))::int as days_since_contact, r.last_out as last_contact_at
  from resolved r
  left join public.profiles m on m.id = r.mgr
  left join promo p on p.creator_id = r.id
  where r.last_out is not null and r.last_out < now() - make_interval(days => p_days)
    and coalesce(p.covered_days, 0) >= 5
    and coalesce(p.promo_days, 0) < p_low_promo_rate * coalesce(p.covered_days, 0)
  order by r.last_out asc;
$function$
;

CREATE OR REPLACE FUNCTION public.get_promo_month_comparison(p_tenant uuid, p_months_back integer DEFAULT 1, p_manager_name text DEFAULT NULL::text)
 RETURNS TABLE(creator_id uuid, name text, instagram_handle text, manager_name text, current_from date, current_to date, prev_from date, prev_to date, window_days integer, promo_days_current integer, promo_days_prev integer, delta integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with bounds as (
    select
      date_trunc('month', (now() at time zone 'America/Bogota')::date)::date as this_start,
      (now() at time zone 'America/Bogota')::date as this_end,
      (date_trunc('month', (now() at time zone 'America/Bogota')::date) - make_interval(months => p_months_back))::date as prev_start,
      least(
        (date_trunc('month', (now() at time zone 'America/Bogota')::date) - make_interval(months => p_months_back))::date
          + ((now() at time zone 'America/Bogota')::date - date_trunc('month', (now() at time zone 'America/Bogota')::date)::date),
        (date_trunc('month', (now() at time zone 'America/Bogota')::date) - make_interval(months => p_months_back)
          + interval '1 month' - interval '1 day')::date
      ) as prev_cutoff
  ),
  active_models as (
    select c.id, coalesce(nullif(c.artistic_name,''), c.name) as name, c.instagram_handle,
           m.full_name as manager_name
    from creators c
    left join profiles m on m.id = c.assigned_manager_profile_id
    where c.status = 'active' and c.assigned_manager_profile_id is not null
      and (p_manager_name is null or m.full_name ilike '%' || p_manager_name || '%')
  ),
  promo as (
    select e.creator_id,
      count(distinct e.dia) filter (
        where e.promoted in ('true','yes') and e.dia >= b.this_start and e.dia <= b.this_end
      ) as cur_days,
      count(distinct e.dia) filter (
        where e.promoted in ('true','yes') and e.dia >= b.prev_start and e.dia <= b.prev_cutoff
      ) as prev_days
    from promolog_entries e cross join bounds b
    where e.tenant_id = p_tenant and e.dia >= b.prev_start
    group by e.creator_id
  )
  select a.id, a.name, a.instagram_handle, a.manager_name,
         b.this_start, b.this_end, b.prev_start, b.prev_cutoff,
         (b.prev_cutoff - b.prev_start + 1) as window_days,
         coalesce(p.cur_days, 0)::int, coalesce(p.prev_days, 0)::int,
         (coalesce(p.cur_days, 0) - coalesce(p.prev_days, 0))::int as delta
  from active_models a
  cross join bounds b
  left join promo p on p.creator_id = a.id
  order by (coalesce(p.cur_days, 0) - coalesce(p.prev_days, 0)) asc, a.name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_promolog_action_feed(p_tenant uuid)
 RETURNS TABLE(kind text, priority integer, creator_id uuid, name text, category text, instagram_handle text, reason text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH promoted_today AS (
    SELECT creator_id, array_agg(DISTINCT lower(network)) AS nets
    FROM promolog_entries
    WHERE tenant_id = p_tenant AND dia = (now() at time zone 'America/Bogota')::date
      AND promoted IN ('true', 'yes') AND creator_id IS NOT NULL
    GROUP BY creator_id
  ),
  read_today AS (
    SELECT DISTINCT creator_id
    FROM promolog_entries
    WHERE tenant_id = p_tenant AND dia = (now() at time zone 'America/Bogota')::date
      AND creator_id IS NOT NULL
      AND coalesce(error_reason, '') <> 'scrape_no_media'
      AND coalesce(story_count, 0) > 0
  ),
  active AS (
    SELECT id, coalesce(NULLIF(artistic_name, ''), name) AS name, category, instagram_handle
    FROM creators WHERE status = 'active'
  )
  SELECT 'tier_sin_promo'::text, 1, a.id, a.name, a.category, a.instagram_handle,
         'Tier alto sin promocionar hoy — empujar promo'::text
  FROM active a
    JOIN read_today r ON r.creator_id = a.id
    LEFT JOIN promoted_today p ON p.creator_id = a.id
  WHERE a.category IN ('Elite', 'A+') AND p.creator_id IS NULL
  UNION ALL
  SELECT 'solo_ig'::text, 3, a.id, a.name, a.category, a.instagram_handle,
         'Solo promociona en IG hoy — empujar otra red'::text
  FROM active a JOIN promoted_today p ON p.creator_id = a.id
  WHERE p.nets = ARRAY['instagram']
  ORDER BY 2, 4;
$function$
;

CREATE OR REPLACE FUNCTION public.pick_discovery_seeds(p_total integer DEFAULT 30)
 RETURNS TABLE(out_handle text, out_source text, out_signal_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quota_creators int := ceil(p_total * 0.50);
  v_quota_leadgen  int := ceil(p_total * 0.30);
  v_quota_scouter  int := p_total - v_quota_creators - v_quota_leadgen;
BEGIN
  RETURN QUERY
  WITH
  -- Normalizador: extrae el handle limpio de un input que puede venir
  -- como URL, con @, con basura al final, etc. Devuelve NULL si no
  -- queda nada válido.
  --   1. lowercase + trim
  --   2. quitar prefijo URL hasta el dominio inclusive
  --   3. cortar en el primer caracter no-handle (slash, coma, espacio, ?, etc)
  --   4. quitar @ inicial
  --   5. validar contra el regex oficial de IG: alfanuméricos + . + _, max 30 chars
  -- IG handle valid: ^[a-zA-Z0-9._]{1,30}$ (no consecutive dots tampoco
  -- pero por ahora con esto alcanza — el scraper rechaza si está mal)
  already_in_scouter AS (
    SELECT DISTINCT lower(trim(sl.instagram_handle)) AS h
    FROM public.scouter_leads sl
    WHERE sl.instagram_handle IS NOT NULL AND trim(sl.instagram_handle) <> ''
  ),
  pool_creators AS (
    SELECT
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(trim(c.instagram_handle)),
            '^https?://(www\.)?(instagram|ig)\.com/', '', 'i'),
          '^@', ''),
        '[^a-z0-9._].*$', '') AS h,
      'creators'::text AS s,
      1.0::numeric AS sc,
      random() AS rnd
    FROM public.creators c
    WHERE c.instagram_handle IS NOT NULL AND trim(c.instagram_handle) <> ''
  ),
  pool_creators_clean AS (
    SELECT h, s, sc, rnd FROM pool_creators
    WHERE h ~ '^[a-z0-9._]{1,30}$'
      AND h NOT IN (SELECT h FROM already_in_scouter)
  ),
  picked_creators AS (
    SELECT h, s, sc FROM pool_creators_clean ORDER BY rnd LIMIT v_quota_creators
  ),
  pool_leadgen AS (
    SELECT DISTINCT ON (regexp_replace(regexp_replace(regexp_replace(lower(trim(le.model_handle)),
        '^https?://(www\.)?(instagram|ig)\.com/', '', 'i'), '^@', ''), '[^a-z0-9._].*$', ''))
      regexp_replace(regexp_replace(regexp_replace(lower(trim(le.model_handle)),
        '^https?://(www\.)?(instagram|ig)\.com/', '', 'i'), '^@', ''), '[^a-z0-9._].*$', '') AS h,
      'leadgen'::text AS s,
      CASE WHEN le.quality = 'A+' THEN 0.9
           WHEN le.quality = 'A'  THEN 0.7
           ELSE 0.5 END::numeric AS sc,
      random() AS rnd
    FROM public.leadgen_entries le
    WHERE le.model_handle IS NOT NULL AND trim(le.model_handle) <> ''
      AND le.quality IN ('A+', 'A')
  ),
  pool_leadgen_clean AS (
    SELECT h, s, sc, rnd FROM pool_leadgen
    WHERE h ~ '^[a-z0-9._]{1,30}$'
      AND h NOT IN (SELECT h FROM already_in_scouter)
      AND h NOT IN (SELECT h FROM picked_creators)
  ),
  picked_leadgen AS (
    SELECT h, s, sc FROM pool_leadgen_clean ORDER BY sc DESC, rnd LIMIT v_quota_leadgen
  ),
  pool_scouter AS (
    SELECT
      lower(trim(sl.instagram_handle)) AS h,
      'scouter_validated'::text AS s,
      coalesce(sl.ai_score::numeric, 7) / 10.0 AS sc,
      random() AS rnd
    FROM public.scouter_leads sl
    WHERE sl.ai_status = 'high_fit'
      AND coalesce(sl.ai_score, 0) >= 7
      AND sl.instagram_handle IS NOT NULL AND trim(sl.instagram_handle) <> ''
  ),
  pool_scouter_clean AS (
    SELECT h, s, sc, rnd FROM pool_scouter
    WHERE h ~ '^[a-z0-9._]{1,30}$'
      AND h NOT IN (SELECT h FROM picked_creators)
      AND h NOT IN (SELECT h FROM picked_leadgen)
  ),
  picked_scouter AS (
    SELECT h, s, sc FROM pool_scouter_clean ORDER BY sc DESC, rnd LIMIT v_quota_scouter
  )
  SELECT h, s, sc FROM picked_creators
  UNION ALL SELECT h, s, sc FROM picked_leadgen
  UNION ALL SELECT h, s, sc FROM picked_scouter
  ORDER BY sc DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.promo_creator_period_scores(p_from date, p_to date, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS TABLE(creator_id uuid, name text, instagram_handle text, manager_name text, target_networks text[], window_days integer, covered_days integer, coverage_pct numeric, promo_days integer, freq_pts numeric, quality_pts numeric, consistency_pts numeric, score integer, is_partial boolean, promo_networks text, manual_share numeric, lift_pct numeric, lift_n_promo integer, lift_n_quiet integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (
    coalesce(current_setting('request.jwt.claims', true), '') = ''
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
    or exists (select 1 from public.user_roles ur
               where ur.user_id = auth.uid() and ur.role in ('admin','manager','owner'))
  ) then
    raise exception 'forbidden: el score de promo es para management' using errcode = '42501';
  end if;

  return query
  with cb as (
    select c.id,
      coalesce(nullif(c.artistic_name,''), c.name) as cname,
      c.instagram_handle as ig,
      pr.full_name as mgr_name,
      coalesce(
        nullif(c.promo_target_networks, '{}'::text[]),
        nullif(array_remove(array[
          case when nullif(trim(coalesce(c.instagram_handle,'')),'') is not null then 'instagram' end,
          case when nullif(trim(coalesce(c.twitter_handle,'')),'')   is not null then 'x' end,
          case when nullif(trim(coalesce(c.telegram_handle,'')),'')  is not null then 'telegram' end,
          case when nullif(trim(coalesce(c.facebook_handle,'')),'')  is not null then 'facebook' end
        ], null), '{}'::text[]),
        array['instagram']
      ) as targets
    from creators c
    left join profiles pr on pr.id = c.assigned_manager_profile_id
    where c.status = 'active'
  ),
  e as (
    select pe.creator_id as cid,
      pe.date::date as d,
      case when lower(coalesce(pe.network,'')) = 'twitter' then 'x' else lower(coalesce(pe.network,'')) end as net,
      coalesce(pe.promoted,'') <> 'pending' as read_ok,
      coalesce(pe.analyzed_by_ai, true) = false as is_manual,
      (lower(coalesce(pe.promoted,'')) in ('true','yes','partial')) as promoted_flag,
      (case
        when lower(coalesce(pe.promoted,'')) not in ('true','yes','partial') then 0
        when coalesce(pe.needs_review, false) = false
             and ( lower(coalesce(pe.platform,'')) in ('fansly','otra')
                or lower(coalesce(pe.buy_link_type,'')) in ('fansly','other') )
             and lower(coalesce(pe.ai_reasoning,'')) !~ 'unlok'
          then 0
        when coalesce(pe.analyzed_by_ai, true) = false then
          case when coalesce(pe.has_buy_link, false) or nullif(pe.buy_link_type,'') is not null then 1.0 else 0.75 end
        when coalesce(pe.has_buy_link, false)
             or lower(coalesce(pe.buy_link_type,'')) in ('onlyfans','unlok','of')
             or lower(coalesce(pe.ai_reasoning,'')) ~ '(of_link|link_agg)'
          then 1.0
        when lower(coalesce(pe.buy_link_type,'')) in ('piclink','linktree')
             or lower(coalesce(pe.platform,'')) in ('piclink','linktree')
          then 0.85
        when lower(coalesce(pe.ai_reasoning,'')) ~ '(onlyfans|of_handle|vision-of)'
          then 0.6
        else 0.3
      end) * (case when lower(coalesce(pe.promoted,'')) = 'partial' then 0.5 else 1 end)
         * (case when pe.ai_appeal is not null
                 then 0.70 + 0.30 * least(1, greatest(0, pe.ai_appeal))
                 else 0.925 end) as q
    from promolog_entries pe
    where (p_tenant is null or pe.tenant_id = p_tenant)
      and pe.date >= p_from::timestamp
      and pe.date <  (p_to + 1)::timestamp
      and lower(coalesce(pe.network,'')) in ('instagram','x','twitter','telegram','facebook')
  ),
  e2 as (select e.*, (e.promoted_flag and e.q > 0) as is_promo from e),
  net_day as (
    select e2.cid, e2.d, e2.net, max(e2.q) as nq
    from e2 where e2.is_promo
    group by e2.cid, e2.d, e2.net
  ),
  vol_day as (
    select e2.cid, e2.d, least(count(*), 4) / 4.0 as vol
    from e2 where e2.is_promo
    group by e2.cid, e2.d
  ),
  day_quality as (
    select nd.cid, nd.d,
      0.60 * max(nd.nq)
      + 0.25 * coalesce((array_agg(nd.nq order by nd.nq desc))[2], 0)
      + 0.15 * coalesce(min(vd.vol), 0) as day_q
    from net_day nd
    join vol_day vd on vd.cid = nd.cid and vd.d = nd.d
    group by nd.cid, nd.d
  ),
  day_target as (
    select cb.id as cid, e2.d,
      bool_or(e2.read_ok) as covered,
      bool_or(e2.is_promo) as promoted,
      bool_or(e2.is_promo) and not bool_or(e2.is_promo and not e2.is_manual) as manual_only
    from cb
    join e2 on e2.cid = cb.id and e2.net = any(cb.targets)
    group by cb.id, e2.d
  ),
  gaps as (
    select runs.cid, max(runs.run_len) as max_gap
    from (
      select marked.cid, marked.grp, count(*) as run_len
      from (
        select dt2.cid, dt2.d, dt2.promoted,
          sum(case when dt2.promoted then 1 else 0 end) over (partition by dt2.cid order by dt2.d) as grp
        from day_target dt2
        where dt2.covered
      ) marked
      where not marked.promoted
      group by marked.cid, marked.grp
    ) runs
    group by runs.cid
  ),
  nets as (
    select e2.cid, string_agg(distinct e2.net, ', ' order by e2.net) as promo_nets
    from e2 where e2.is_promo group by e2.cid
  ),
  agg as (
    select cb.id as cid, cb.cname, cb.ig, cb.mgr_name, cb.targets,
      (p_to - p_from + 1) as wdays,
      count(*) filter (where dt.covered)::int as cov_days,
      count(*) filter (where dt.promoted)::int as pro_days,
      count(*) filter (where dt.manual_only)::int as manual_days,
      avg(dq.day_q) filter (where dt.promoted) as avg_day_q
    from cb
    left join day_target dt on dt.cid = cb.id
    left join day_quality dq on dq.cid = dt.cid and dq.d = dt.d
    group by cb.id, cb.cname, cb.ig, cb.mgr_name, cb.targets
  ),
  income as (
    select dt.cid,
      avg(cde.total_gross) filter (where dt.promoted) as inc_after_promo,
      avg(cde.total_gross) filter (where not dt.promoted) as inc_after_quiet,
      count(*) filter (where dt.promoted)::int as n_promo,
      count(*) filter (where not dt.promoted)::int as n_quiet
    from day_target dt
    join creator_daily_earnings cde on cde.creator_id = dt.cid and cde.date = dt.d + 1
    where dt.covered and dt.d + 1 <= current_date - 2
    group by dt.cid
  )
  select
    a.cid, a.cname, a.ig, a.mgr_name, a.targets,
    a.wdays,
    a.cov_days,
    round(100.0 * a.cov_days / nullif(a.wdays, 0)) as coverage_pct,
    a.pro_days,
    round(40.0 * a.pro_days / nullif(a.cov_days, 0), 1) as freq_pts,
    round(40.0 * coalesce(a.avg_day_q, 0), 1) as quality_pts,
    case
      when a.pro_days = 0 then 0
      else round(20.0 * greatest(0, 1 - greatest(coalesce(g.max_gap, 0) - 1, 0) / 6.0), 1)
    end as consistency_pts,
    least(100, round(
      coalesce(40.0 * a.pro_days / nullif(a.cov_days, 0), 0)
      + 40.0 * coalesce(a.avg_day_q, 0)
      + case when a.pro_days = 0 then 0
             else 20.0 * greatest(0, 1 - greatest(coalesce(g.max_gap, 0) - 1, 0) / 6.0) end
    ))::int as score,
    (a.cov_days < 0.6 * a.wdays) as is_partial,
    n.promo_nets as promo_networks,
    case when a.pro_days > 0 then round(100.0 * a.manual_days / a.pro_days) end as manual_share,
    case
      when coalesce(i.n_promo, 0) >= 5 and coalesce(i.n_quiet, 0) >= 5 and i.inc_after_quiet > 0
      then round(100.0 * (i.inc_after_promo - i.inc_after_quiet) / i.inc_after_quiet)
      else null
    end as lift_pct,
    coalesce(i.n_promo, 0) as lift_n_promo,
    coalesce(i.n_quiet, 0) as lift_n_quiet
  from agg a
  left join gaps g on g.cid = a.cid
  left join nets n on n.cid = a.cid
  left join income i on i.cid = a.cid
  order by score desc nulls last, a.cname;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.promolog_fallos_bloque()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with hoy as (select (now() at time zone 'America/Bogota')::date as d),
  fallos as (
    select e.creator_id, e.network, e.error_reason, max(e.scraped_at) as ultimo
    from promolog_entries e, hoy
    where e.dia = hoy.d
      and e.error_reason is not null
      and e.error_reason <> 'unconfirmed_empty'
    group by 1, 2, 3
  ),
  con_datos as (
    select f.network,
           case
             when f.error_reason = 'throttled' then 'IG nos frenó (rate-limit) — se reintenta solo'
             when f.error_reason = 'no_ig_id' then 'el handle no resuelve (¿cambió o está rota?)'
             when f.error_reason = 'follow_pending' then 'perfil personal de FB — falta amistad'
             when f.error_reason like 'json_parse%' then 'error de lectura del bot'
             else f.error_reason
           end as motivo,
           coalesce(c.artistic_name, c.instagram_handle, '?') as creadora,
           split_part(coalesce(p.full_name, '—'), ' ', 1) as manager,
           (select n.reason || ' (' || split_part(coalesce(pn.full_name,'?'),' ',1)
                   || ' ' || to_char(n.created_at at time zone 'America/Bogota','DD/MM') || ')'
            from promolog_scan_notes n
            left join profiles pn on pn.id = n.set_by
            where n.creator_id = f.creator_id and n.active
              and (n.network is null or n.network = f.network)
            order by n.created_at desc limit 1) as explicacion
    from fallos f
    join creators c on c.id = f.creator_id
    left join profiles p on p.id = c.assigned_manager_profile_id
  ),
  sin_explicar as (
    select motivo, string_agg(creadora || ' (' || manager || ')', ', ' order by creadora) as lista, count(*) n
    from con_datos where explicacion is null group by motivo
  ),
  explicadas as (
    select string_agg(creadora || ' — ' || explicacion, E'\n· ' order by creadora) as lista, count(*) n
    from con_datos where explicacion is not null
  )
  select
    case when (select count(*) from con_datos) = 0
      then 'Sin fallos reales de lectura hoy ✓ (0 historias NO es un fallo: es lectura válida sin promo)'
      else
        coalesce((select string_agg('⚠️ ' || s.motivo || ' (' || s.n || '): ' || s.lista, E'\n') from sin_explicar s), '')
        || case when (select n from explicadas) > 0
             then E'\nCon razón ya conocida (no alarmar):\n· ' || (select lista from explicadas)
             else '' end
    end;
$function$
;

CREATE OR REPLACE FUNCTION public.ventas_tops(_from date, _to date, _limite integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_chatters jsonb;
  v_closers  jsonb;
  v_managers jsonb;
begin
  if not (
    public.has_permission(auth.uid(), 'Creator Sales', null)
    or public.is_in_role_group(auth.uid(), 'manager_or_above')
  ) then
    raise exception 'sin permiso para ver los tops de ventas';
  end if;

  select coalesce(jsonb_agg(t order by t.ventas desc), '[]'::jsonb) into v_chatters
  from (
    select ci.display_name                          as nombre,
           round(sum(m.sales)::numeric, 2)          as ventas,
           round(sum(case when m.agency = 'plus' then m.sales else 0 end)::numeric, 0)    as plus,
           round(sum(case when m.agency = 'massive' then m.sales else 0 end)::numeric, 0) as massive,
           sum(m.sold_messages)                     as mensajes,
           count(distinct m.dia)                    as dias
    from public.chatter_model_daily m
    join public.chatter_identity ci on ci.id = m.identity_id
    where m.dia between _from and _to
    group by ci.id, ci.display_name
    having sum(m.sales) > 0
    order by sum(m.sales) desc
    limit _limite
  ) t;

  select coalesce(jsonb_agg(t order by t.usd_mensual desc), '[]'::jsonb) into v_closers
  from (
    select p.full_name                             as nombre,
           count(*)                                 as ganadas,
           round(coalesce(sum(mo.monthly_value_usd), 0)::numeric, 0) as usd_mensual,
           (select round(avg(n.nota_sugerida), 1)
              from public.corte_notas n
             where n.profile_id = mo.assigned_to
               and n.fecha between _from and _to)   as nota_corte
    from public.monetization_opportunities mo
    join public.profiles p on p.id = mo.assigned_to
    where mo.stage = 'won'
      and mo.won_at is not null
      and mo.won_at::date between _from and _to
    group by mo.assigned_to, p.full_name
    order by sum(coalesce(mo.monthly_value_usd, 0)) desc
    limit _limite
  ) t;

  select coalesce(jsonb_agg(t order by t.pct_dias desc), '[]'::jsonb) into v_managers
  from (
    with roster as (
      select c.id as creator_id, c.assigned_manager_id as manager_id, p.full_name as nombre
      from public.creators c
      join public.profiles p on p.id = c.assigned_manager_id
      where c.status = 'active'
    ), dias as (
      select e.creator_id, e.dia,
             max(case when lower(e.promoted) in ('si','sí','yes','true') then 1 else 0 end) as promovio
      from public.promolog_entries e
      where e.dia between _from and _to
      group by e.creator_id, e.dia
    )
    select r.nombre,
           count(distinct r.creator_id)                                    as creadoras,
           count(distinct d.creator_id) filter (where d.promovio = 1)      as promocionaron,
           count(*) filter (where d.promovio = 1)                          as dias_con_promo,
           count(d.dia)                                                    as dias_medidos,
           round(100.0 * count(*) filter (where d.promovio = 1)
                 / greatest(count(d.dia), 1), 1)                           as pct_dias,
           (select round(avg(n.nota_sugerida), 1)
              from public.corte_notas n
             where n.profile_id = r.manager_id
               and n.fecha between _from and _to)                          as nota_corte
    from roster r
    left join dias d on d.creator_id = r.creator_id
    group by r.manager_id, r.nombre
    order by pct_dias desc
    limit _limite
  ) t;

  return jsonb_build_object('chatters', v_chatters, 'closers', v_closers, 'managers', v_managers);
end;
$function$
;

-- ─── Permisos de EXECUTE de prod ─────────────────────────────────────────────
-- Todas las del fixture: authenticated y service_role sí; anon solo en las dos que
-- prod le deja (create_platform_deal_for_creator y create_ticket_from_form).
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f, p.proname from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prorettype <> 'trigger'::regtype
             and p.proname in ('blu_conciliacion','chatter_can_view_creator','contact_filter_cities','contact_ids_by_city',
               'convert_contact_to_creator','corte_cierre_prep','create_platform_deal_for_creator','create_recruitment_deal_for_creator',
               'create_ticket_from_form','find_creator_history_by_handle','find_creator_name_by_email','find_creator_name_by_phone',
               'get_contact_funnel_list','get_contact_funnel_stats','get_contact_history','get_contact_statuses','get_creator_scan_config',
               'get_creator_top_fans','get_dashboard2_creator_summary','get_manager_contact_stats','get_manager_growth_stats',
               'get_manager_roster_stats','get_manager_silent_creators','get_manager_silent_no_promo','get_promo_day_breakdown',
               'get_promo_day_faltantes','get_promo_month_comparison','get_promolog_action_feed','get_promolog_stale_creators',
               'get_tg_contact_ig','get_wa_contact_ig','operations_dashboard_kpis','pick_discovery_seeds','promo_creator_period_scores',
               'promolog_fallos_bloque','reactivate_creator','set_creator_whatsapp','ventas_tops')
  loop
    if r.proname not in ('create_platform_deal_for_creator', 'create_ticket_from_form') then
      execute format('revoke all on function %s from public, anon', r.f);
    end if;
    execute format('grant execute on function %s to authenticated, service_role', r.f);
  end loop;
end $$;

-- ─── RLS de creators y las vistas (después de las funciones que usan) ──────
alter table public.creators enable row level security;
create policy "Admins can delete creators" on public.creators as permissive for delete to authenticated using (has_role(auth.uid(), 'admin'::app_role));
create policy "Authorized roles can insert creators" on public.creators as permissive for insert to authenticated with check ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'closer'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role) OR has_creators_global_scope(auth.uid()) OR is_in_role_group(auth.uid(), 'supervisor_or_above'::text)));
create policy "Authenticated users can view creators" on public.creators as permissive for select to authenticated using (true);
create policy creators_scope_select on public.creators as restrictive for select to authenticated using ((has_creators_global_scope(auth.uid()) OR (closer_responsible_id = auth.uid()) OR (assigned_manager_id = auth.uid()) OR chatter_can_view_creator(auth.uid(), id)));
create policy "Managers and admins can update creators" on public.creators as permissive for update to authenticated using ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_creators_global_scope(auth.uid()) OR is_in_role_group(auth.uid(), 'supervisor_or_above'::text)));

-- Stub del webhook externo (en prod: supabase_functions.http_request a otro proyecto).
CREATE TRIGGER "CREATORS_WEBHOOK_USERNAME" AFTER INSERT OR DELETE OR UPDATE ON public.creators FOR EACH ROW EXECUTE FUNCTION _webhook_creadoras_stub();

-- ─── Las vistas de creadoras ─────────────────────────────────────────────────
create view public.v_creators as
 SELECT id,
    name,
    artistic_name,
    age,
    bio,
    birth_date,
    category,
    chat_url,
    city,
    country,
    country_code,
    created_at,
    external_transfer,
    instagram_followers,
    instagram_handle,
    internal_notes,
    languages,
    linkedin_handle,
    notes,
    onlyfans_url,
    piclink_url,
    profile_photo_url,
    registration_date,
    source,
    status,
    tiktok_handle,
    twitter_handle,
    updated_at,
    youtube_handle,
    assigned_manager_id,
    assigned_specialist_id,
    closer_responsible_id,
    assigned_manager_profile_id,
    assigned_specialist_profile_id,
    closer_responsible_profile_id,
    signo_zodiacal,
    wishlist_url,
    estatura,
    medidas_cm,
    talla_brasier,
    tatuajes_piercings_detalle,
    rutina_diaria,
    hobbies,
    mascotas_nombres,
    comida_favorita,
    nivel_estudios,
    apodos_permitidos,
    palabras_prohibidas,
    emoji_frecuente,
    tono_voz,
    contenido_jamas_haria,
    precios_contenido,
    segundo_nombre,
    direccion,
    timezone,
    etnicidad,
    cicatrices,
    nivel_lectura,
    permiso_nombre_real,
    permiso_edad_real,
    permiso_ubicacion,
    edad_mostrar,
    ubicacion_artistica,
    otras_plataformas,
    link_otras_plataformas,
    helado_favorito,
    bebida_favorita,
    musica_artistas,
    peliculas_tv,
    viajes_favoritos,
    viajes_por_visitar,
    hermanos,
    dia_perfecto,
    como_eres_cuando_nadie_ve,
    como_quieres_que_te_llamen,
    respuesta_sexo_en_persona,
    respuesta_usuario_grosero,
    respuesta_pedir_desnudos,
    que_te_incomoda,
    horarios_sueno,
    deporte_equipo,
    color_favorito,
    estado_civil,
    que_buscas_pareja,
    mejor_atributo_fisico,
    metas_largo_plazo,
    que_haces_relajarte,
    que_te_hace_reir,
    que_te_motiva_crear,
    respuesta_cuanto_cobra_encuentro,
    respuesta_muestra_intimas,
    estrategia_material_gratis,
    estrategia_problemas_personales,
    schedule_config,
    currency,
    gfe_disponible,
    personalidad_marca,
    estrategia_rechazo,
    tono_emocional,
    frases_venta,
    usuarios_vip,
    plataforma_videollamada,
    estrategia_recuperacion,
    interesa_dinamicas_grupales,
    terminos_afecto,
    restricciones_seguridad,
    orientacion_perfil,
    redes_sociales,
    wishlist_amazon,
    last_autosave_at,
    created_by,
    entered_crm_at,
    entered_crm_by,
    entered_crm_notes,
    phone_first_set_at,
    model_id,
    blu_infloww_active,
    category_code,
    facebook_handle,
    reddit_handle,
    other_url,
    telegram_handle,
        CASE
            WHEN is_phone_privileged() THEN phone
            ELSE mask_phone(phone)
        END AS phone,
        CASE
            WHEN is_phone_privileged() THEN phone_e164
            ELSE mask_phone(phone_e164)
        END AS phone_e164,
        CASE
            WHEN is_phone_privileged() THEN whatsapp_number
            ELSE mask_phone(whatsapp_number)
        END AS whatsapp_number,
        CASE
            WHEN is_phone_privileged() THEN email
            ELSE mask_email(email)
        END AS email,
    onboarding_video_key,
    onboarding_video_at,
    onboarding_video_bytes,
    onboarding_video_by
   FROM creators
  WHERE has_creators_global_scope(auth.uid()) OR closer_responsible_id = auth.uid() OR assigned_manager_id = auth.uid() OR chatter_can_view_creator(auth.uid(), id);

create view public.v_promolog_eligible_creators with (security_invoker = false) as
 SELECT id,
    name,
    artistic_name,
    instagram_handle,
    onlyfans_url,
    instagram_followers,
    assigned_manager_profile_id,
    assigned_specialist_profile_id
   FROM creators c
  WHERE status = 'active'::text AND instagram_handle IS NOT NULL AND instagram_handle <> ''::text;

create view public.v_creator_prospects as
 SELECT id,
    name,
    instagram,
    tiktok,
    platform,
    category,
    agency,
    country,
    source,
    status,
    notes,
    created_by,
    created_at,
    updated_at,
        CASE
            WHEN is_phone_privileged() THEN phone
            ELSE mask_phone(phone)
        END AS phone,
        CASE
            WHEN is_phone_privileged() THEN email
            ELSE mask_email(email)
        END AS email
   FROM creator_prospects
  WHERE has_permission(auth.uid(), 'Creadores'::text, NULL::text) OR created_by = auth.uid();

-- Permisos de prod: anon escribe sin leer; authenticated, todo.
revoke all on public.v_creators, public.v_promolog_eligible_creators, public.v_creator_prospects from anon, authenticated;
grant insert, update, delete, truncate, references, trigger, maintain on public.v_creators, public.v_promolog_eligible_creators, public.v_creator_prospects to anon;
grant select, insert, update, delete, truncate, references, trigger, maintain on public.v_creators, public.v_promolog_eligible_creators, public.v_creator_prospects to authenticated;

