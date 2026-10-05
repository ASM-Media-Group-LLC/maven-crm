-- PORTAL DE CREADORAS, FASE 1: la cuenta de la creadora y su ficha.
-- Banco: supabase/tests/portal_creadoras.ts. La edge: portal-creadoras.
-- Requiere 20261005140000_creadoras_por_agencia y 20261005140100_cuentas_externas_y_avisos.
--
-- La creadora entra con su correo personal. Su cuenta de auth.users lleva
-- app_metadata.tipo = 'creadora' (sin rol de la agencia y fuera de
-- tenant_members: ver 20261005140100). Lo que la une a su ficha es esta tabla.
--
-- 1. creadora_cuentas: una fila por (cuenta, creadora). Una misma persona puede
--    trabajar con dos agencias: misma cuenta, dos filas, una ficha en cada una.
--    La escribe SOLO la edge portal-creadoras (service_role). La lee quien ve a
--    esa creadora (la RLS de creators decide) y la propia creadora.
-- 2. La ficha que ella edita (22 columnas de creators, las de «Operaciones» que
--    son suyas: su personaje, lo que jamás haría y cómo responder si pasa algo).
--    NO: precios, usuarios VIP, estrategia de recuperación ni nada comercial.
--    La lista vive en UN lugar, portal_campos_ficha(), y el frontend la repite
--    en lib/portal/ficha.ts (un test compara las dos).
--    Ella no toca la tabla: lee y guarda con portal_mi_ficha / portal_guardar_ficha
--    (SECURITY DEFINER, solo si la ficha es suya).
-- 3. Historial: todo cambio a esas 22 columnas queda en creator_history, lo haga
--    ella desde el portal («portal:<columna>») o alguien de la agencia desde
--    Operaciones («ficha:<columna>»), con quién y cuándo. Lo hace un trigger,
--    así no depende de que cada pantalla se acuerde.
--    Y el historial se vuelve confiable: solo se ve el de las creadoras que uno
--    ve (antes: cualquiera con permiso de Creadores veía y podía BORRAR o
--    cambiar el historial de todas, de cualquier agencia), y no se edita ni se
--    borra desde el navegador.
-- 4. portal_hola: el portal avisa que ella entró (como mucho cada 5 minutos),
--    para que la agencia vea «entró hace 2 h» o «todavía no entra».
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop trigger creators_ficha_historial on public.creators;
--| drop function public.creators_ficha_historial();
--| drop policy creator_history_de_mi_agencia on public.creator_history;
--| drop policy creator_history_no_se_cambia on public.creator_history;
--| drop policy creator_history_no_se_borra on public.creator_history;
--| drop function public.portal_hola(uuid);
--| drop function public.portal_guardar_ficha(uuid, jsonb);
--| drop function public.portal_mi_ficha(uuid);
--| drop function public.portal_mis_agencias();
--| drop function public.portal_cuenta_por_correo(text);
--| drop function public.es_mi_ficha(uuid);
--| drop table public.creadora_cuentas;
--| drop function public.creadora_cuentas_revisar();
--| drop function public.portal_campos_ficha();

-- ─── 0. Las 22 columnas existen y son texto ─────────────────────────────────
create function public.portal_campos_ficha()
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select array[
    -- Mi personaje
    'tono_voz', 'tono_emocional', 'como_quieres_que_te_llamen', 'emoji_frecuente',
    'personalidad_marca', 'terminos_afecto', 'frases_venta', 'apodos_permitidos',
    'palabras_prohibidas', 'hobbies', 'mascotas_nombres', 'comida_favorita',
    -- Jamás haría
    'contenido_jamas_haria', 'restricciones_seguridad',
    -- Si pasa esto…
    'respuesta_sexo_en_persona', 'respuesta_usuario_grosero', 'respuesta_pedir_desnudos',
    'respuesta_cuanto_cobra_encuentro', 'respuesta_muestra_intimas',
    'estrategia_material_gratis', 'estrategia_problemas_personales', 'estrategia_rechazo'
  ]::text[]
$$;
comment on function public.portal_campos_ficha() is
  'Las columnas de creators que la creadora edita desde el portal (su parte de Operaciones). Una sola lista: la usan portal_mi_ficha, portal_guardar_ficha y el trigger del historial; lib/portal/ficha.ts la repite y un test las compara.';

do $$
declare
  faltan text[];
begin
  select array_agg(k) into faltan
  from unnest(public.portal_campos_ficha()) k
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'creators' and c.column_name = k and c.data_type = 'text'
  );
  if faltan is not null then
    raise exception 'portal_creadoras_cuentas: estas columnas de creators no existen o no son texto: %', faltan;
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.creadoras_de_mi_agencia()'::regprocedure) then
    raise exception 'portal_creadoras_cuentas: falta creadoras_de_mi_agencia (20261005140000)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'cuenta_externa_sin_rol') then
    raise exception 'portal_creadoras_cuentas: falta cuenta_externa_sin_rol (20261005140100)';
  end if;
end $$;

-- ─── 1. La cuenta de la creadora ─────────────────────────────────────────────
create table public.creadora_cuentas (
  user_id uuid not null references auth.users (id) on delete cascade,
  creator_id uuid not null references public.creators (id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  -- El correo personal con el que entra. Desde el navegador NO se lee: se lee
  -- correo_visible («s•••@gmail.com», como v_creators muestra el de la ficha).
  correo text not null,
  correo_visible text generated always as (public.mask_email(correo)) stored,
  invitada_por uuid references auth.users (id) on delete set null,
  invitada_en timestamptz not null default now(),
  primer_acceso timestamptz,
  ultimo_acceso timestamptz,
  primary key (user_id, creator_id),
  -- Una ficha, una cuenta. (Una cuenta, varias fichas: una por agencia.)
  constraint creadora_cuentas_una_por_ficha unique (creator_id)
);
create index creadora_cuentas_agencia_idx on public.creadora_cuentas (tenant_id);
comment on table public.creadora_cuentas is
  'La cuenta del portal de cada creadora (portal de creadoras). La escribe solo la edge portal-creadoras. Ver 20261006100000.';

-- La agencia sale de la ficha, nunca de quien escribe; la cuenta tiene que ser
-- de creadora (una de empleado nunca se ata a una ficha); y en una agencia, una
-- cuenta es de UNA sola ficha.
create function public.creadora_cuentas_revisar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select c.tenant_id into new.tenant_id from public.creators c where c.id = new.creator_id;
  if new.tenant_id is null then
    raise exception 'creadora_cuentas: la creadora % no existe', new.creator_id using errcode = '23503';
  end if;
  if not exists (select 1 from auth.users u where u.id = new.user_id and (u.raw_app_meta_data ->> 'tipo') = 'creadora') then
    raise exception 'creadora_cuentas: la cuenta % no es de creadora', new.user_id using errcode = '42501';
  end if;
  if exists (select 1 from public.tenant_members tm where tm.user_id = new.user_id) then
    raise exception 'creadora_cuentas: la cuenta % es de alguien de una agencia', new.user_id using errcode = '42501';
  end if;
  if exists (select 1 from public.creadora_cuentas o
             where o.user_id = new.user_id and o.tenant_id = new.tenant_id and o.creator_id <> new.creator_id) then
    raise exception 'creadora_cuentas: esa cuenta ya es de otra creadora de la misma agencia' using errcode = '23505';
  end if;
  new.correo := lower(btrim(new.correo));
  return new;
end $$;
revoke all on function public.creadora_cuentas_revisar() from public, anon, authenticated;

create trigger creadora_cuentas_revisar
  before insert or update of user_id, creator_id, tenant_id, correo on public.creadora_cuentas
  for each row execute function public.creadora_cuentas_revisar();

alter table public.creadora_cuentas enable row level security;
revoke all on table public.creadora_cuentas from public, anon, authenticated;
grant select (user_id, creator_id, tenant_id, correo_visible, invitada_por, invitada_en, primer_acceso, ultimo_acceso)
  on table public.creadora_cuentas to authenticated;
grant select, insert, update, delete on table public.creadora_cuentas to service_role;

-- La ve quien ve a la creadora (el exists pasa por la RLS de creators: su
-- agencia y su alcance) y la propia creadora; el correo, enmascarado. Nadie la
-- escribe desde el navegador.
create policy creadora_cuentas_quien_la_ve on public.creadora_cuentas
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.creators c where c.id = creadora_cuentas.creator_id)
  );

-- ¿Esta ficha es de quien pregunta?
create function public.es_mi_ficha(p_creator uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.creadora_cuentas cc
    where cc.user_id = (select auth.uid()) and cc.creator_id = p_creator
  )
$$;
revoke all on function public.es_mi_ficha(uuid) from public, anon;
grant execute on function public.es_mi_ficha(uuid) to authenticated;

-- Para la edge: ¿ese correo ya tiene cuenta, y de qué tipo? Solo service_role.
create function public.portal_cuenta_por_correo(p_correo text)
returns table (user_id uuid, tipo text, es_de_agencia boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.id,
         coalesce(u.raw_app_meta_data ->> 'tipo', ''),
         exists (select 1 from public.tenant_members tm where tm.user_id = u.id)
  from auth.users u
  where lower(u.email) = lower(btrim(p_correo)) and u.deleted_at is null
  limit 1
$$;
revoke all on function public.portal_cuenta_por_correo(text) from public, anon, authenticated;
grant execute on function public.portal_cuenta_por_correo(text) to service_role;

-- ─── 2. Lo que ve y edita la creadora ───────────────────────────────────────
-- Sus agencias (una fila por ficha): para el inicio y para cambiar de agencia.
create function public.portal_mis_agencias()
returns table (creator_id uuid, tenant_id uuid, agencia text, nombre text, nombre_artistico text, foto text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id, c.tenant_id, t.name, c.name, c.artistic_name, c.profile_photo_url
  from public.creadora_cuentas cc
  join public.creators c on c.id = cc.creator_id
  join public.tenants t on t.id = cc.tenant_id
  where cc.user_id = (select auth.uid())
  order by cc.invitada_en
$$;
revoke all on function public.portal_mis_agencias() from public, anon;
grant execute on function public.portal_mis_agencias() to authenticated;

-- Su ficha: las 22 columnas, y nada más.
create function public.portal_mi_ficha(p_creator uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_fila jsonb;
begin
  if not public.es_mi_ficha(p_creator) then
    raise exception 'portal: esa ficha no es tuya' using errcode = '42501';
  end if;
  select to_jsonb(c) into v_fila from public.creators c where c.id = p_creator;
  return (select jsonb_object_agg(k, v_fila -> k) from unnest(public.portal_campos_ficha()) k);
end $$;
revoke all on function public.portal_mi_ficha(uuid) from public, anon;
grant execute on function public.portal_mi_ficha(uuid) to authenticated;

-- Guardar: solo esas columnas, solo texto, como mucho 4.000 caracteres cada una.
-- Vacío = sin dato (null), igual que Operaciones. El historial lo escribe el
-- trigger de abajo. Devuelve la ficha como quedó.
create function public.portal_guardar_ficha(p_creator uuid, p_cambios jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare
  v_permitidos text[] := public.portal_campos_ficha();
  v_clave text;
  v_valor jsonb;
  v_sets text[] := '{}';
begin
  if not public.es_mi_ficha(p_creator) then
    raise exception 'portal: esa ficha no es tuya' using errcode = '42501';
  end if;
  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception 'portal: los cambios van como un objeto' using errcode = '22023';
  end if;
  for v_clave, v_valor in select * from jsonb_each(p_cambios) loop
    if not (v_clave = any (v_permitidos)) then
      raise exception 'portal: «%» no es un campo de tu ficha', v_clave using errcode = '22023';
    end if;
    if jsonb_typeof(v_valor) not in ('string', 'null') then
      raise exception 'portal: «%» tiene que ser texto', v_clave using errcode = '22023';
    end if;
    if char_length(v_valor #>> '{}') > 4000 then
      raise exception 'portal: «%» es demasiado largo (máximo 4000 caracteres)', v_clave using errcode = '22001';
    end if;
    v_sets := v_sets || format('%I = nullif(btrim($1 ->> %L), %L)', v_clave, v_clave, '');
  end loop;
  if cardinality(v_sets) > 0 then
    execute format('update public.creators set %s where id = $2', array_to_string(v_sets, ', '))
      using p_cambios, p_creator;
  end if;
  return public.portal_mi_ficha(p_creator);
end $$;
revoke all on function public.portal_guardar_ficha(uuid, jsonb) from public, anon;
grant execute on function public.portal_guardar_ficha(uuid, jsonb) to authenticated;

-- «Entró»: primer y último acceso, como mucho una escritura cada 5 minutos.
create function public.portal_hola(p_creator uuid)
returns void
language sql
volatile
security definer
set search_path to 'public'
as $$
  update public.creadora_cuentas
     set ultimo_acceso = now(), primer_acceso = coalesce(primer_acceso, now())
   where user_id = (select auth.uid()) and creator_id = p_creator
     and (ultimo_acceso is null or ultimo_acceso < now() - interval '5 minutes')
$$;
revoke all on function public.portal_hola(uuid) from public, anon;
grant execute on function public.portal_hola(uuid) to authenticated;

-- ─── 3. El historial de la ficha ─────────────────────────────────────────────
-- Una fila por columna que cambió. Sin sesión (service_role, cron, el webhook)
-- no se anota: creator_history pide quién, y esos cambios no son de una persona.
create function public.creators_ficha_historial()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quien uuid := (select auth.uid());
  v_antes jsonb;
  v_ahora jsonb;
  v_origen text;
  v_campo text;
begin
  if v_quien is null then
    return null;
  end if;
  v_antes := to_jsonb(old);
  v_ahora := to_jsonb(new);
  v_origen := case
    when exists (select 1 from public.creadora_cuentas cc where cc.user_id = v_quien and cc.creator_id = new.id) then 'portal'
    else 'ficha'
  end;
  foreach v_campo in array public.portal_campos_ficha() loop
    if (v_antes ->> v_campo) is distinct from (v_ahora ->> v_campo) then
      insert into public.creator_history (creator_id, user_id, action, old_value, new_value)
      values (new.id, v_quien, v_origen || ':' || v_campo, v_antes ->> v_campo, v_ahora ->> v_campo);
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.creators_ficha_historial() from public, anon, authenticated;

create trigger creators_ficha_historial
  after update on public.creators
  for each row
  when (
       old.tono_voz is distinct from new.tono_voz
    or old.tono_emocional is distinct from new.tono_emocional
    or old.como_quieres_que_te_llamen is distinct from new.como_quieres_que_te_llamen
    or old.emoji_frecuente is distinct from new.emoji_frecuente
    or old.personalidad_marca is distinct from new.personalidad_marca
    or old.terminos_afecto is distinct from new.terminos_afecto
    or old.frases_venta is distinct from new.frases_venta
    or old.apodos_permitidos is distinct from new.apodos_permitidos
    or old.palabras_prohibidas is distinct from new.palabras_prohibidas
    or old.hobbies is distinct from new.hobbies
    or old.mascotas_nombres is distinct from new.mascotas_nombres
    or old.comida_favorita is distinct from new.comida_favorita
    or old.contenido_jamas_haria is distinct from new.contenido_jamas_haria
    or old.restricciones_seguridad is distinct from new.restricciones_seguridad
    or old.respuesta_sexo_en_persona is distinct from new.respuesta_sexo_en_persona
    or old.respuesta_usuario_grosero is distinct from new.respuesta_usuario_grosero
    or old.respuesta_pedir_desnudos is distinct from new.respuesta_pedir_desnudos
    or old.respuesta_cuanto_cobra_encuentro is distinct from new.respuesta_cuanto_cobra_encuentro
    or old.respuesta_muestra_intimas is distinct from new.respuesta_muestra_intimas
    or old.estrategia_material_gratis is distinct from new.estrategia_material_gratis
    or old.estrategia_problemas_personales is distinct from new.estrategia_problemas_personales
    or old.estrategia_rechazo is distinct from new.estrategia_rechazo
  )
  execute function public.creators_ficha_historial();

-- Solo el historial de las creadoras que uno ve (su agencia y su alcance), y
-- desde el navegador no se cambia ni se borra: se agrega.
create policy creator_history_de_mi_agencia on public.creator_history
  as restrictive for all to authenticated
  using (exists (select 1 from public.creators c where c.id = creator_history.creator_id))
  with check (exists (select 1 from public.creators c where c.id = creator_history.creator_id));
create policy creator_history_no_se_cambia on public.creator_history
  as restrictive for update to authenticated
  using (false);
create policy creator_history_no_se_borra on public.creator_history
  as restrictive for delete to authenticated
  using (false);
