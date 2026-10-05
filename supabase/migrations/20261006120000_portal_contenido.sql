-- PORTAL DE CREADORAS, FASE 2: su contenido, en el Drive de su agencia.
-- Banco: supabase/tests/portal_contenido.ts. La edge: portal-contenido.
-- Requiere 20261006100000_portal_creadoras_cuentas y el Drive (20261002130000
-- unidades, 20261002160000 drive_mi_rol), ya en prod.
--
-- 1. La carpeta de cada creadora es una UNIDAD 'empresa' más del Drive de su
--    agencia («Contenido · Sofi»), marcada en creadora_carpetas. Por ser unidad:
--    · cada archivo de adentro sabe de qué unidad es (unidad_id, con los
--      triggers de 20261002130000), y eso es lo que comprueba la edge;
--    · gasta el espacio de la AGENCIA, no el cupo de una persona;
--    · aparece en «Unidades» del Drive para quien la puede abrir.
--    La crea la edge portal-contenido la primera vez que ella entra a «Mi contenido».
-- 2. Quién del equipo la abre, como lector (ver y bajar): quien VE a esa creadora
--    (su agencia y su alcance: lo mismo que la RLS de creators) y tiene el
--    permiso «Ver y descargar su contenido» (Creadores; sin fila explícita en su
--    rol, supervisor o más). Se suma a drive_mi_rol, que es lo que mira toda la
--    RLS del Drive.
-- 3. Ella NO pasa por la RLS del Drive (no es de la agencia: current_tenant_id es
--    null para ella): lo suyo lo hace la edge con service_role, después de
--    comprobar que la ficha es suya (creadora_cuentas) y que el archivo es de SU
--    carpeta.
-- 4. drive_espacio_de_la_agencia(agencia): el espacio usado y el tope, para la
--    edge (drive_uso_agencia lee la agencia de quien llama, y ella no tiene).
-- 5. creadora_ocultos: lo que ella «borra» desde el portal. Decisión de Jhon
--    (06/10): que pueda borrar, pero solo en SU vista. No se borra nada: el
--    archivo sigue en el Drive, la agencia lo sigue viendo (marcado como que ella
--    lo sacó de su vista) y sigue ocupando el espacio de la agencia. Lo único que
--    sí se borra de verdad es una subida que quedó a medias (no es contenido).
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| do $$ declare r record; begin for r in select def from public.portal_contenido_respaldo order by fn loop execute r.def; end loop; end $$;
--| drop table public.portal_contenido_respaldo;
--| drop table public.creadora_ocultos;
--| drop function public.drive_espacio_de_la_agencia(uuid);
--| drop table public.creadora_carpetas;
--| drop function public.creadora_carpetas_revisar();
--| drop function public.puedo_ver_contenido_de(uuid);

-- ─── 0. Lo revisado es lo que hay ───────────────────────────────────────────
create table public.portal_contenido_respaldo (fn text primary key, def text not null, guardada timestamptz not null default now());
alter table public.portal_contenido_respaldo enable row level security;
revoke all on table public.portal_contenido_respaldo from public, anon, authenticated;
comment on table public.portal_contenido_respaldo is
  'Definiciones de antes de 20261006120000_portal_contenido, para su vuelta atrás. Sin políticas.';

do $$
declare
  v_qual text;
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.drive_mi_rol(uuid)'::regprocedure)
     is distinct from 'dbfc25b5f58c1fbcf1e329839d931d2d' then
    raise exception 'portal_contenido: drive_mi_rol no es la que se revisó: mira qué cambió antes de aplicar';
  end if;
  if (select md5(prosrc) from pg_proc where oid = 'public.drive_uso_agencia()'::regprocedure)
     is distinct from 'b824cb3885145438edc80c89d4085870' then
    raise exception 'portal_contenido: drive_uso_agencia no es la que se revisó: la copia con agencia quedaría distinta';
  end if;
  -- puedo_ver_contenido_de repite el alcance de la RLS de creators: si cambió, revisar.
  select qual into v_qual from pg_policies
   where schemaname = 'public' and tablename = 'creators' and policyname = 'creators_scope_select';
  if v_qual is distinct from '(has_creators_global_scope(auth.uid()) OR (closer_responsible_id = auth.uid()) OR (assigned_manager_id = auth.uid()) OR chatter_can_view_creator(auth.uid(), id))' then
    raise exception 'portal_contenido: la política creators_scope_select no es la que se revisó: %', v_qual;
  end if;
  if to_regclass('public.creadora_cuentas') is null then
    raise exception 'portal_contenido: falta creadora_cuentas (20261006100000)';
  end if;
  insert into public.portal_contenido_respaldo (fn, def)
  values ('public.drive_mi_rol(uuid)', pg_get_functiondef('public.drive_mi_rol(uuid)'::regprocedure));
end $$;

-- ─── 1. La carpeta de cada creadora ─────────────────────────────────────────
create table public.creadora_carpetas (
  creator_id uuid primary key references public.creators (id) on delete cascade,
  item_id uuid not null unique references public.drive_unidades (item_id) on delete cascade,
  tenant_id uuid not null references public.tenants (id),
  created_at timestamptz not null default now()
);
comment on table public.creadora_carpetas is
  'La carpeta de contenido de cada creadora en el Drive de su agencia: una unidad empresa. La escribe solo la edge portal-contenido. Ver 20261006120000.';

-- La agencia sale de la ficha, y la carpeta es una unidad 'empresa' de esa agencia.
create function public.creadora_carpetas_revisar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  select c.tenant_id into new.tenant_id from public.creators c where c.id = new.creator_id;
  if new.tenant_id is null then
    raise exception 'creadora_carpetas: la creadora % no existe', new.creator_id using errcode = '23503';
  end if;
  if not exists (select 1 from public.drive_unidades u
                 where u.item_id = new.item_id and u.tipo = 'empresa' and u.tenant_id = new.tenant_id) then
    raise exception 'creadora_carpetas: la carpeta tiene que ser una unidad de la agencia de la creadora' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function public.creadora_carpetas_revisar() from public, anon, authenticated;

create trigger creadora_carpetas_revisar
  before insert or update on public.creadora_carpetas
  for each row execute function public.creadora_carpetas_revisar();

alter table public.creadora_carpetas enable row level security;
revoke all on table public.creadora_carpetas from public, anon, authenticated;
grant select on table public.creadora_carpetas to authenticated;
grant select, insert, update, delete on table public.creadora_carpetas to service_role;

-- La ve quien ve a la creadora (por la RLS de creators) y ella. Que la vea no
-- quiere decir que pueda abrirla: eso lo dice drive_mi_rol.
create policy creadora_carpetas_quien_la_ve on public.creadora_carpetas
  for select to authenticated
  using (
    exists (select 1 from public.creators c where c.id = creadora_carpetas.creator_id)
    or public.es_mi_ficha(creator_id)
  );

-- ─── 2. Quién del equipo abre su contenido ──────────────────────────────────
-- Ve a la creadora (su agencia y su alcance, como creators_scope_select y
-- creators_de_mi_agencia) y tiene el permiso.
create function public.puedo_ver_contenido_de(p_creator uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
           select 1 from public.creators c
           where c.id = p_creator
             and c.tenant_id = public.current_tenant_id()
             and (public.has_creators_global_scope(auth.uid())
                  or c.closer_responsible_id = auth.uid()
                  or c.assigned_manager_id = auth.uid()
                  or public.chatter_can_view_creator(auth.uid(), c.id))
         )
     and public.can_use_module_function(auth.uid(), 'Creadores', 'Ver y descargar su contenido', 'supervisor_or_above')
$$;
revoke all on function public.puedo_ver_contenido_de(uuid) from public, anon;
grant execute on function public.puedo_ver_contenido_de(uuid) to authenticated;

-- drive_mi_rol: igual que antes, más una rama al final: si alguna carpeta de
-- arriba es la de una creadora y puedo ver su contenido, soy lector.
create or replace function public.drive_mi_rol(p_item uuid)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  WITH RECURSIVE cadena AS (
    SELECT i.id, i.parent_id, i.owner_id, i.tenant_id, 0 AS nivel
    FROM public.drive_items i WHERE i.id = p_item
    UNION ALL
    SELECT p.id, p.parent_id, p.owner_id, p.tenant_id, c.nivel + 1
    FROM public.drive_items p JOIN cadena c ON p.id = c.parent_id
    WHERE c.nivel < 50
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM cadena WHERE nivel = 0 AND tenant_id = public.current_tenant_id()) THEN NULL
    WHEN EXISTS (SELECT 1 FROM cadena WHERE owner_id = auth.uid()) THEN 'dueno'
    WHEN EXISTS (SELECT 1 FROM cadena c JOIN public.drive_shares s ON s.item_id = c.id
                 WHERE s.user_id = auth.uid() AND s.rol = 'editor')
      OR EXISTS (SELECT 1 FROM cadena c JOIN public.drive_compartido_agencia a ON a.item_id = c.id
                 WHERE a.rol = 'editor') THEN 'editor'
    WHEN EXISTS (SELECT 1 FROM cadena c JOIN public.drive_shares s ON s.item_id = c.id
                 WHERE s.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM cadena c JOIN public.drive_compartido_agencia a ON a.item_id = c.id) THEN 'lector'
    WHEN EXISTS (SELECT 1 FROM cadena c JOIN public.creadora_carpetas k ON k.item_id = c.id
                 WHERE public.puedo_ver_contenido_de(k.creator_id)) THEN 'lector'
    ELSE NULL
  END
$function$;

-- ─── 3. El espacio de una agencia, para la edge ─────────────────────────────
-- La misma cuenta que drive_uso_agencia (20261002130000), con la agencia como dato.
create function public.drive_espacio_de_la_agencia(p_agencia uuid)
returns table (usado bigint, cupo bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  n integer;
  e public.drive_espacio_agencia%rowtype;
begin
  select count(*) into n from public.tenant_members m where m.tenant_id = p_agencia;
  select * into e from public.drive_espacio_agencia x where x.tenant_id = p_agencia;
  return query select
    coalesce((select sum(i.size) from public.drive_items i
              where i.tenant_id = p_agencia and i.unidad_id is not null and i.tipo = 'archivo'), 0)::bigint,
    case
      when e.tenant_id is not null and e.por_persona is null then null
      else coalesce(e.por_persona, public.drive_espacio_por_persona_por_defecto()) * n + coalesce(e.extra, 0)
    end::bigint;
end;
$function$;
revoke all on function public.drive_espacio_de_la_agencia(uuid) from public, anon, authenticated;
grant execute on function public.drive_espacio_de_la_agencia(uuid) to service_role;

-- ─── 4. Lo que ella saca de su vista ────────────────────────────────────────
create table public.creadora_ocultos (
  item_id uuid primary key references public.drive_items (id) on delete cascade,
  creator_id uuid not null references public.creators (id) on delete cascade,
  ocultado_en timestamptz not null default now()
);
create index creadora_ocultos_creadora_idx on public.creadora_ocultos (creator_id);
comment on table public.creadora_ocultos is
  'Lo que la creadora borró de SU vista en el portal. No se borra nada: la agencia lo sigue viendo y el archivo sigue en el Drive. La escribe solo la edge portal-contenido. Ver 20261006120000.';

alter table public.creadora_ocultos enable row level security;
revoke all on table public.creadora_ocultos from public, anon, authenticated;
grant select on table public.creadora_ocultos to authenticated;
grant select, insert, update, delete on table public.creadora_ocultos to service_role;

-- Lo ve quien ve a la creadora (para marcarlo en la pestaña Contenido del perfil).
create policy creadora_ocultos_quien_lo_ve on public.creadora_ocultos
  for select to authenticated
  using (exists (select 1 from public.creators c where c.id = creadora_ocultos.creator_id));
