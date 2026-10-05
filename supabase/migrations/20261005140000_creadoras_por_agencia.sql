-- CREADORAS POR AGENCIA: antes de abrir el portal de creadoras (cuentas externas),
-- cada creadora es de UNA agencia y nadie de otra agencia la ve, la toca ni la
-- recibe en una función. Banco: supabase/tests/creadoras_por_agencia.ts, sobre el
-- catálogo de PROD del 05/10 (fixtures/prod_creadoras_20261005.sql, con huellas).
-- Requiere 20261001210000_agencias_base, 20261001211000_roles_por_agencia y
-- 20261001212000_personas_por_agencia (ya en prod).
--
-- Qué cambia:
--   1. creators.tenant_id: NOT NULL, con clave foránea a tenants e índice. Las 345
--      creadoras de hoy van a la única agencia que hay (asm-tech; el DO de abajo
--      falla si hay más de una). Se agrega con un DEFAULT constante que se saca
--      enseguida: Postgres no reescribe la tabla ni corre un UPDATE, así que NO
--      se disparan sus triggers. Importa: CREATORS_WEBHOOK_USERNAME manda cada
--      UPDATE de creators a un proyecto externo; un relleno con UPDATE le habría
--      mandado 345 avisos.
--   2. creators_agencia (BEFORE INSERT / UPDATE OF tenant_id): al crear, la pone
--      la base con la agencia de quien crea (current_tenant_id); si quien crea es
--      una persona, no puede elegir otra; sin agencia no crea. Con service_role
--      (o sin JWT: cron, editor) la agencia la dice el pedido o se toma la de
--      created_by; si no hay ninguna, falla. Después no se cambia nunca, ni con
--      service_role.
--   3. creators_de_mi_agencia: política RESTRICTIVA para SELECT, INSERT, UPDATE y
--      DELETE: tenant_id = current_tenant_id(). Se suma a las de hoy (alcance,
--      quién crea, quién edita, quién borra), que no cambian.
--   4. has_creators_global_scope: el alcance global es EXPLÍCITO. Admin de su
--      agencia, o un rol con permiso de Creadores (sin submódulo, can_access) y
--      alcance que no sea 'self'. Se va la rama implícita «supervisor_or_above
--      sin fila de Creadores ⇒ ve todas». En prod el 05/10 eso no le cambia nada a
--      nadie (las 61 personas activas ven lo mismo; el banco lo prueba con un
--      rol de supervisor sin permiso de Creadores). Sin rol o sin agencia: nada.
--      Nota: la versión de prod ya no era la del repo (20260618060000, «admin o
--      NOT EXISTS self», que le daba todo a quien no tuviera fila): la había
--      endurecido alguien a mano. Esta la deja escrita.
--   5. v_creators (corre como su dueño y filtra en su WHERE) suma «y de mi
--      agencia». v_promolog_eligible_creators no filtraba NADA: cualquier sesión
--      leía nombre, @, OnlyFans y manager de todas las activas; ahora, las de la
--      agencia de quien llama (service_role sigue viendo todas: la leen cuatro
--      edges de Promolog).
--   6. Las vistas de creadoras ya no se escriben. v_creators,
--      v_promolog_eligible_creators y v_creator_prospects son vistas
--      «actualizables» que corren como postgres (BYPASSRLS): un INSERT, UPDATE o
--      DELETE contra la vista saltaba TODA la RLS de la tabla. Cualquier sesión
--      podía borrar una creadora activa por v_promolog_eligible_creators, y anon
--      podía INSERTAR en las tres. La app solo las LEE (inventario en el PR).
--   7. Las 37 funciones SECURITY DEFINER que alguien con sesión puede llamar y
--      que leen creators (postgres salta la RLS, así que la política del punto 3
--      no las alcanza):
--      · 35 leen: cada «FROM/JOIN creators» pasa a «FROM/JOIN
--        public.creadoras_de_mi_agencia()», que devuelve las filas de creators de
--        la agencia de quien llama (todas si es service_role o no hay JWT, como
--        hoy). Es SQL, STABLE y no SECURITY DEFINER: Postgres la expande dentro
--        de la consulta (sin costo extra) y siempre trae las columnas de hoy de
--        creators (una vista se quedaría con las de su día).
--      · reactivate_creator y set_creator_whatsapp escriben: su UPDATE suma
--        «y tenant_id = current_tenant_id()».
--      Cada una se reescribe desde su definición viva solo si su huella
--      md5(prosrc) es la revisada y la regla aplica las veces esperadas (si no,
--      falla sin tocar nada). Al final se revisa TODO el esquema: si queda una
--      función SECURITY DEFINER que alguien con sesión puede llamar y lee
--      creators sin pasar por la agencia, también falla.
--
-- Lo que NO cierra (queda en el PR como siguiente paso):
--   · Las tablas hijas que cuelgan de creator_id sin tenant_id (custom_requests,
--     closer_creators, creator_business, creator_status_history,
--     chatter_group_creators, promolog_*, tickets, invoices, …): se leen por su
--     propia RLS.
--   · Las 13 funciones SECURITY DEFINER que leen creators y solo llama
--     service_role (alvaro_pulse, api_promolog_daily, blu_match_creator,
--     get_sub_pricing, resolve_wa_name, search_creators_fuzzy, sync_models_recent…):
--     la agencia la tiene que pasar la edge o el cron que las llama.
--   · Los 3 triggers de closers_contacts que miran creators por @ (no devuelven
--     datos) y get_agenda_by_share_token (lee tablas que ya no existen en prod).
--
-- Con una sola agencia nadie deja de ver nada: el banco compara persona por
-- persona, tabla, vista y funciones.
--
-- Índice: creators tiene 345 filas, así que el índice va aquí mismo (un CREATE
-- INDEX normal de milisegundos), sin CONCURRENTLY.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre). Solo con UNA agencia.
-- Restaura las 38 funciones y las 2 vistas desde el respaldo y les devuelve a las
-- vistas los permisos de escritura que tenían (el hueco incluido).
--| do $$ declare r record; begin for r in select def from public.creadoras_por_agencia_respaldo order by fn loop execute r.def; end loop; end $$;
--| drop table public.creadoras_por_agencia_respaldo;
--| drop function public.creadoras_de_mi_agencia();
--| drop policy creators_de_mi_agencia on public.creators;
--| drop trigger creators_agencia on public.creators;
--| drop function public.creators_agencia();
--| grant insert, update, delete, truncate, references, trigger, maintain on public.v_creators, public.v_promolog_eligible_creators, public.v_creator_prospects to anon, authenticated;
--| alter table public.creators drop column tenant_id;

-- ─── 0. Una sola agencia, y lo revisado es lo que hay ───────────────────────
do $$
begin
  if (select count(*) from public.tenants) <> 1 then
    raise exception 'creadoras_por_agencia: hay % agencias; el relleno de tenant_id supone exactamente una', (select count(*) from public.tenants);
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'creators' and column_name = 'tenant_id') then
    raise exception 'creadoras_por_agencia: creators ya tiene tenant_id';
  end if;
end $$;

create table public.creadoras_por_agencia_respaldo (fn text primary key, def text not null, guardada timestamptz not null default now());
alter table public.creadoras_por_agencia_respaldo enable row level security;
revoke all on table public.creadoras_por_agencia_respaldo from public, anon, authenticated;
comment on table public.creadoras_por_agencia_respaldo is
  'Definiciones de antes de 20261005140000_creadoras_por_agencia (funciones y vistas), para su vuelta atrás. Sin políticas.';

-- Las funciones que se reescriben, con su huella de prod del 05/10 y cuántas
-- lecturas de creators tiene cada una (FROM/JOIN). Las dos que escriben van con 0:
-- se ajustan con un reemplazo textual (punto 7).
create temp table _creadoras_fn (fn text primary key, huella text not null, lecturas int not null) on commit drop;
insert into _creadoras_fn values
  ('public.blu_conciliacion(integer)', '3e9d48e60396e3c0fee3dbcffc744bc8', 3),
  ('public.contact_filter_cities()', '64a172710fe8486ce949c72e93239e7e', 1),
  ('public.contact_ids_by_city(text)', '2c2b105f5e60fc0142c75186b2da642b', 1),
  ('public.convert_contact_to_creator(uuid)', '0ab366880c16c11383e666e4f78cba70', 1),
  ('public.corte_cierre_prep(uuid)', '10366d2621b3839fb00b4c45c275b981', 3),
  ('public.create_platform_deal_for_creator(uuid,text,numeric,uuid)', 'f3bc6175b12d838d43e123ba5ca846e8', 1),
  ('public.create_recruitment_deal_for_creator(uuid,uuid,numeric,numeric)', 'bd86911a0d48455a6b6b27e22fb4f28c', 1),
  ('public.create_ticket_from_form(uuid,jsonb,uuid)', '111c04e0f3cd7116d5312556a72edc9e', 2),
  ('public.find_creator_history_by_handle(text)', 'b4b7573c8611fbc906404033a3978454', 2),
  ('public.find_creator_name_by_email(text)', '3bdc2ad5a0869a9237dd9a63abae23c5', 1),
  ('public.find_creator_name_by_phone(text)', 'e1150824c1c0fc9f7c8983a9dc67f525', 1),
  ('public.get_contact_funnel_list(text,date,date)', 'a0520c9560fd5a68cc13ce57ece5bdf7', 2),
  ('public.get_contact_funnel_stats(date,date)', 'a04ee7de2ea45e686fcb3e41d179b17a', 4),
  ('public.get_contact_history(uuid)', '44b53de2c2e8493f3d496ee88ff607d3', 1),
  ('public.get_contact_statuses()', 'a1d039fa2839badbe13691bea678bdd7', 1),
  ('public.get_creator_scan_config(uuid,text)', '6966d5dc9c9e987a8ce8c1023a0315f6', 1),
  ('public.get_creator_top_fans(uuid,text,integer,text)', 'adff02bf74bca1dfc357f96cacd5c691', 1),
  ('public.get_dashboard2_creator_summary(date,date)', '11a2c14206e107d26b4ab3129b33b0f9', 1),
  ('public.get_manager_contact_stats(date,date,uuid)', 'bb688829f0394ac20279bbcaf544f3a6', 1),
  ('public.get_manager_growth_stats(date,date,uuid)', 'b8804b2a96788cecbca7026018984328', 1),
  ('public.get_manager_roster_stats(uuid,date)', '62c94b1d00a2c1b4b7650b7928f52bf8', 1),
  ('public.get_manager_silent_creators(uuid,integer)', '8f1e46e8eab48f49943cc1a4c082e9ee', 1),
  ('public.get_manager_silent_no_promo(uuid,integer,numeric)', '71c3a7c57c6ca31a9c94a3e9ef2b0209', 1),
  ('public.get_promo_day_breakdown(uuid,date,text)', '804b403449f781dfbf785edc68b0766f', 1),
  ('public.get_promo_day_faltantes(uuid,date,text)', 'f68097a50ce80c6a7351d1e0d5717562', 1),
  ('public.get_promo_month_comparison(uuid,integer,text)', 'e24d6d82191e591c73360ec8816b5d18', 1),
  ('public.get_promolog_action_feed(uuid)', 'd242b65caef031869bf785912922afb5', 1),
  ('public.get_promolog_stale_creators(integer)', '4885033204e70e08ec223ca4586fd22a', 1),
  ('public.get_tg_contact_ig(uuid)', '9ea83f2fab1f24654a42a941ac01c7df', 1),
  ('public.get_wa_contact_ig(uuid)', '0095e1bd1ba4106ccc71f354015b5fc0', 1),
  ('public.operations_dashboard_kpis(timestamp with time zone,timestamp with time zone)', 'dedef764f816778da993b3f4daf3e1fa', 1),
  ('public.pick_discovery_seeds(integer)', '2cd50f84ccbe41444f6181790bef5268', 1),
  ('public.promo_creator_period_scores(date,date,uuid)', '117e3b1519ef036eb3c4e03c92bcaf57', 1),
  ('public.promolog_fallos_bloque()', '53368ece565fc2d1e5025151667e989e', 1),
  ('public.ventas_tops(date,date,integer)', '178f3c52eefa8a50971fdde7bc628c92', 1),
  ('public.reactivate_creator(uuid,uuid)', '5854872c3efeb2ad31dce4828d9bd451', 0),
  ('public.set_creator_whatsapp(uuid,text)', '93fbb99a8625da9a757dc53e045ca896', 0),
  ('public.has_creators_global_scope(uuid)', '85baab72ae99f15fdbed4cfd45527e45', 0);

do $$
declare
  r record;
  h text;
begin
  for r in select * from _creadoras_fn order by fn loop
    select md5(p.prosrc) into h from pg_proc p where p.oid = r.fn::regprocedure;
    if h is distinct from r.huella then
      raise exception 'creadoras_por_agencia: % no es la que se revisó (huella %, se esperaba %): mira qué cambió antes de aplicar', r.fn, h, r.huella;
    end if;
    insert into public.creadoras_por_agencia_respaldo (fn, def) values (r.fn, pg_get_functiondef(r.fn::regprocedure));
  end loop;

  -- Las dos vistas que cambian de WHERE: la definición de prod del 05/10.
  for r in select * from (values
    ('public.v_creators', 'd286f5f820eba757217b16b55f4936f9'),
    ('public.v_promolog_eligible_creators', 'efad2ad98ba908312a3dbf8dfdb6a09e')
  ) as x(vista, huella) loop
    h := md5(pg_get_viewdef(r.vista::regclass, true));
    if h is distinct from r.huella then
      raise exception 'creadoras_por_agencia: la vista % no es la que se revisó (huella %, se esperaba %)', r.vista, h, r.huella;
    end if;
    insert into public.creadoras_por_agencia_respaldo (fn, def)
    values (r.vista, 'create or replace view ' || r.vista || ' as ' || rtrim(btrim(pg_get_viewdef(r.vista::regclass, true)), ';'));
  end loop;
end $$;

-- ─── 1. La agencia de cada creadora ─────────────────────────────────────────
-- DEFAULT constante = sin reescritura y sin UPDATE (ver cabecera); se saca enseguida.
do $$
begin
  execute format('alter table public.creators add column tenant_id uuid not null default %L references public.tenants(id)',
                 (select id from public.tenants));
end $$;
alter table public.creators alter column tenant_id drop default;
create index creators_agencia_idx on public.creators (tenant_id);

comment on column public.creators.tenant_id is
  'La agencia de la creadora. La pone la base al crearla (creators_agencia) y no se cambia. Toda lectura y escritura con sesión exige la de quien llama (creators_de_mi_agencia).';

create function public.creators_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mia uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'creators_agencia: la agencia de una creadora no se cambia' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Una persona (authenticated o anon): siempre la agencia de quien crea.
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    v_mia := public.current_tenant_id();
    if v_mia is null then
      raise exception 'creators_agencia: sin agencia no se crean creadoras' using errcode = '42501';
    end if;
    if new.tenant_id is null then
      new.tenant_id := v_mia;
    elsif new.tenant_id <> v_mia then
      raise exception 'creators_agencia: la creadora tiene que ser de tu agencia' using errcode = '42501';
    end if;
    return new;
  end if;

  -- service_role, cron o el editor: la que diga el pedido, o la de quien la creó.
  if new.tenant_id is null and new.created_by is not null then
    new.tenant_id := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.created_by);
  end if;
  if new.tenant_id is null then
    raise exception 'creators_agencia: falta la agencia de la creadora (tenant_id o un created_by con agencia)' using errcode = '23502';
  end if;
  return new;
end $$;

revoke all on function public.creators_agencia() from public, anon, authenticated;

create trigger creators_agencia
  before insert or update of tenant_id on public.creators
  for each row execute function public.creators_agencia();

-- ─── 2. Toda lectura y escritura con sesión: la agencia de quien llama ───────
create policy creators_de_mi_agencia on public.creators
  as restrictive for all to public
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- ─── 3. El alcance global, explícito ─────────────────────────────────────────
create or replace function public.has_creators_global_scope(_user_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  -- 20261005140000: admin de su agencia, o un rol (de su agencia y activo) con
  -- permiso de Creadores y alcance que no sea 'self'. Sin rol o sin agencia: false.
  SELECT public.is_in_role_group(_user_id,'admin')
    OR ( EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles_config rc ON rc.name=ur.role and rc.tenant_id = ur.tenant_id and rc.is_active
                 JOIN public.role_permissions rp ON rp.role_id=rc.id
                 WHERE ur.user_id=_user_id AND rp.module='Creadores' AND rp.submodule IS NULL
                   AND rp.can_access AND rp.data_scope IS DISTINCT FROM 'self')
         AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles_config rc ON rc.name=ur.role and rc.tenant_id = ur.tenant_id
                         JOIN public.role_permissions rp ON rp.role_id=rc.id
                         WHERE ur.user_id=_user_id AND rp.module='Creadores' AND rp.submodule IS NULL AND rp.data_scope='self') );
$function$;

-- ─── 4. Las vistas: también la agencia ───────────────────────────────────────
do $$
declare
  v_def text;
  v_nueva text;
  v_viejo constant text := E'\n  WHERE has_creators_global_scope(auth.uid()) OR closer_responsible_id = auth.uid() OR assigned_manager_id = auth.uid() OR chatter_can_view_creator(auth.uid(), id)';
  v_viejo2 constant text := E'\n  WHERE status = ''active''::text AND instagram_handle IS NOT NULL AND instagram_handle <> ''''::text';
begin
  v_def := rtrim(btrim(pg_get_viewdef('public.v_creators'::regclass, true)), ';');
  v_nueva := replace(v_def, v_viejo,
    E'\n  WHERE (has_creators_global_scope(auth.uid()) OR closer_responsible_id = auth.uid() OR assigned_manager_id = auth.uid() OR chatter_can_view_creator(auth.uid(), id))'
    || E'\n    AND tenant_id = (SELECT public.current_tenant_id())');
  if v_nueva = v_def then
    raise exception 'creadoras_por_agencia: el WHERE de v_creators no es el esperado';
  end if;
  execute 'create or replace view public.v_creators as ' || v_nueva;

  v_def := rtrim(btrim(pg_get_viewdef('public.v_promolog_eligible_creators'::regclass, true)), ';');
  v_nueva := replace(v_def, v_viejo2, v_viejo2
    || E'\n    AND (tenant_id = (SELECT public.current_tenant_id()) OR (SELECT COALESCE(auth.role(), ''service_role''::text)) = ''service_role''::text)');
  if v_nueva = v_def then
    raise exception 'creadoras_por_agencia: el WHERE de v_promolog_eligible_creators no es el esperado';
  end if;
  execute 'create or replace view public.v_promolog_eligible_creators as ' || v_nueva;
end $$;

-- ─── 5. Las vistas de creadoras solo se leen ─────────────────────────────────
-- CREATE OR REPLACE VIEW conserva los permisos: hay que sacarlos aparte.
revoke insert, update, delete, truncate, references, trigger, maintain
  on public.v_creators, public.v_promolog_eligible_creators, public.v_creator_prospects
  from anon, authenticated;

-- ─── 6. Las creadoras de la agencia de quien llama, para las funciones ───────
-- No es SECURITY DEFINER ni tiene SET a propósito: así Postgres la expande dentro
-- de la consulta que la usa. La llaman funciones SECURITY DEFINER (corren como
-- postgres, que salta la RLS); por la API no se llama (sin EXECUTE).
create function public.creadoras_de_mi_agencia()
returns setof public.creators
language sql
stable
as $$
  select c.* from public.creators c
  where c.tenant_id = (select public.current_tenant_id())
     or (select coalesce(auth.role(), 'service_role')) = 'service_role'
$$;

comment on function public.creadoras_de_mi_agencia() is
  'Las filas de creators de la agencia de quien llama (todas con service_role o sin JWT). Para funciones SECURITY DEFINER, que no pasan por la RLS.';

revoke all on function public.creadoras_de_mi_agencia() from public, anon, authenticated;
grant execute on function public.creadoras_de_mi_agencia() to service_role;

-- ─── 7. Las funciones SECURITY DEFINER ───────────────────────────────────────
do $$
declare
  regla constant text := $r$\m(from|join)(\s+)(public\.)?creators\M$r$;
  r record;
  def text;
  texto text;
  n int;
  quedan text;
begin
  for r in select * from _creadoras_fn where lecturas > 0 order by fn loop
    def := pg_get_functiondef(r.fn::regprocedure);
    select count(*) into n from regexp_matches(def, regla, 'gi');
    if n <> r.lecturas then
      raise exception 'creadoras_por_agencia: % lee creators % vez/veces, se esperaban %', r.fn, n, r.lecturas;
    end if;
    texto := regexp_replace(def, regla, '\1\2public.creadoras_de_mi_agencia()', 'gi');
    execute texto;
  end loop;

  -- Las dos que escriben: solo una creadora de la agencia de quien llama.
  def := pg_get_functiondef('public.reactivate_creator(uuid,uuid)'::regprocedure);
  texto := replace(def, $q$   where c.id = p_creator_id$q$, $q$   where c.id = p_creator_id and c.tenant_id = public.current_tenant_id()$q$);
  if (length(def) - length(replace(def, $q$   where c.id = p_creator_id$q$, ''))) <> length($q$   where c.id = p_creator_id$q$) then
    raise exception 'creadoras_por_agencia: reactivate_creator no tiene la forma esperada';
  end if;
  execute texto;

  def := pg_get_functiondef('public.set_creator_whatsapp(uuid,text)'::regprocedure);
  texto := replace(def, $q$   where id = p_creator_id;$q$, $q$   where id = p_creator_id and tenant_id = public.current_tenant_id();$q$);
  if (length(def) - length(replace(def, $q$   where id = p_creator_id;$q$, ''))) <> length($q$   where id = p_creator_id;$q$) then
    raise exception 'creadoras_por_agencia: set_creator_whatsapp no tiene la forma esperada';
  end if;
  execute texto;

  -- Ninguna función SECURITY DEFINER que alguien con sesión pueda llamar lee o
  -- escribe creators sin pasar por la agencia (una nueva en prod se revisa antes).
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into quedan
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype
    and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
    and (p.prosrc ~* $r$\m(from|join)\s+(public\.)?creators\M$r$
         or (p.prosrc ~* $r$\mupdate\s+(public\.)?creators\M$r$
             and p.prosrc !~ 'tenant_id = public\.current_tenant_id\(\)'))
    and p.proname <> 'get_agenda_by_share_token';  -- lee events/event_guests, que ya no existen
  if quedan is not null then
    raise exception 'creadoras_por_agencia: estas funciones leen creators sin la agencia y no están revisadas: %', quedan;
  end if;
end $$;
