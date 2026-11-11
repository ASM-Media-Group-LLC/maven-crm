-- LA CARPETA DE LA CREADORA, PARA DEJAR DROPBOX (Alvaro, 10/11/2026: «¿dónde está
-- la mierda para que suban contenido mis creadoras como si fuera Dropbox y dejar
-- de pagar Dropbox?»).
--
-- Lo que Alvaro decidió: las creadoras suben, VEN lo que ya subieron, RECIBEN lo
-- que el equipo les deja y COMPARTEN con fotógrafos/editores de afuera; lo que
-- suben se ordena en una subcarpeta POR DÍA; y cada una de las activas tiene su
-- link personal (Alvaro se lo manda). Lo viejo de Dropbox se pasa después.
--
-- Se construye sobre el link público que ya existe (/aportar/<token>):
--
--   · drive_upload_links.tipo
--       'subir'    → el link de siempre: solo sube (los 33 que ya existían).
--       'personal' → EL de la creadora: sube, ve y baja todo lo de su carpeta,
--                    ve «Del equipo» y saca links para externos. Uno por carpeta.
--       'invitado' → lo saca la creadora para su fotógrafo: solo sube.
--       'ver'      → lo saca la creadora para compartir una carpeta: solo ve y baja.
--     Los links viejos NO se abren para ver: quien ya los tenía solo puede subir,
--     como siempre. El link personal es uno nuevo.
--   · drive_carpeta_creadora: qué carpeta del Drive es de qué creadora.
--   · Funciones solo del servidor (la edge drive-aporte): la carpeta del día,
--     «¿esto está dentro de su carpeta?» y lo que hay adentro de una carpeta.
--   · Funciones del equipo: la lista de creadoras con su link, el link personal
--     (lo crea si falta) y crear la carpeta de una creadora que no tiene.

-- ── El tipo de link ─────────────────────────────────────────────────────────
alter table public.drive_upload_links
  add column if not exists tipo text not null default 'subir',
  add column if not exists creator_id uuid references public.creators(id) on delete set null,
  add column if not exists padre_token text references public.drive_upload_links(token) on delete cascade,
  add column if not exists usado_at timestamptz;

alter table public.drive_upload_links
  add constraint drive_upload_links_tipo_valido check (tipo in ('subir', 'personal', 'invitado', 'ver'));

-- Un solo link personal activo por carpeta (si dos fichas de creadora apuntan a
-- la misma carpeta —una persona con dos cuentas—, comparten link).
create unique index if not exists drive_upload_links_un_personal
  on public.drive_upload_links (item_id) where tipo = 'personal' and activo;
create index if not exists drive_upload_links_padre_idx
  on public.drive_upload_links (padre_token) where padre_token is not null;

-- ── Qué carpeta es de qué creadora ──────────────────────────────────────────
create table if not exists public.drive_carpeta_creadora (
  creator_id   uuid primary key references public.creators(id) on delete cascade,
  item_id      uuid not null references public.drive_items(id) on delete cascade,
  tenant_id    uuid not null,
  asignado_por uuid,
  created_at   timestamptz not null default now()
);
create index if not exists drive_carpeta_creadora_item_idx on public.drive_carpeta_creadora (item_id);

alter table public.drive_carpeta_creadora enable row level security;
create policy "ver carpeta de la creadora" on public.drive_carpeta_creadora
  for select to authenticated
  using (public.drive_mi_rol(item_id) is not null or public.es_dueno((select auth.uid())));
revoke insert, update, delete on public.drive_carpeta_creadora from authenticated, anon;
grant select on public.drive_carpeta_creadora to authenticated;

-- ── Solo del servidor ───────────────────────────────────────────────────────

-- La subcarpeta «nombre» dentro de «padre»: la que ya está o una nueva. Con
-- candado, para que dos subidas al mismo tiempo no creen dos «2026-11-10».
create or replace function public.drive_carpeta_hija(_padre uuid, _nombre text, _owner uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_tenant uuid;
  v_owner uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(_padre::text || '/' || lower(_nombre), 0));
  select id into v_id
    from public.drive_items
   where parent_id = _padre and tipo = 'carpeta' and trashed_at is null and lower(nombre) = lower(_nombre)
   order by created_at
   limit 1;
  if v_id is not null then return v_id; end if;

  select tenant_id, owner_id into v_tenant, v_owner
    from public.drive_items where id = _padre and tipo = 'carpeta' and trashed_at is null;
  if v_tenant is null then raise exception 'la carpeta no existe'; end if;

  insert into public.drive_items (tenant_id, owner_id, parent_id, tipo, nombre, estado)
  values (v_tenant, coalesce(_owner, v_owner), _padre, 'carpeta', _nombre, 'listo')
  returning id into v_id;
  return v_id;
end;
$$;

-- ¿«item» está dentro de «raíz» (o es ella)? Nada de la cadena en la papelera.
create or replace function public.drive_dentro_de(_item uuid, _raiz uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actual uuid := _item;
  padre uuid;
  borrado timestamptz;
  pasos int := 0;
begin
  if _item is null or _raiz is null then return false; end if;
  loop
    select parent_id, trashed_at into padre, borrado from public.drive_items where id = actual;
    if not found or borrado is not null then return false; end if;
    if actual = _raiz then return true; end if;
    actual := padre;
    pasos := pasos + 1;
    if actual is null or pasos > 60 then return false; end if;
  end loop;
end;
$$;

-- Lo que hay dentro de una carpeta (carpetas primero, lo nuevo arriba), con
-- cuántas cosas tiene cada subcarpeta.
create or replace function public.drive_hijos_publicos(_carpeta uuid)
returns table (id uuid, nombre text, tipo text, mime text, size bigint, estado text, created_at timestamptz, hijos bigint)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.nombre, i.tipo, i.mime, i.size, i.estado, i.created_at,
         case when i.tipo = 'carpeta'
              then (select count(*) from public.drive_items h where h.parent_id = i.id and h.trashed_at is null)
         end
    from public.drive_items i
   where i.parent_id = _carpeta and i.trashed_at is null
   order by (i.tipo = 'carpeta') desc, i.created_at desc
   limit 2000;
$$;

revoke all on function public.drive_carpeta_hija(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.drive_dentro_de(uuid, uuid) from public, anon, authenticated;
revoke all on function public.drive_hijos_publicos(uuid) from public, anon, authenticated;
grant execute on function public.drive_carpeta_hija(uuid, text, uuid) to service_role;
grant execute on function public.drive_dentro_de(uuid, uuid) to service_role;
grant execute on function public.drive_hijos_publicos(uuid) to service_role;

-- ── Del equipo ──────────────────────────────────────────────────────────────

-- Quién puede dar links de subida (lo mismo que ya pedía link_subida_de_carpeta).
create or replace function public.puede_dar_links_subida(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _uid is not null and (
    coalesce((select p.nivel in ('dueno', 'admin', 'manager', 'supervisor') from public.profiles p where p.id = _uid), false)
    or public.es_dueno(_uid)
    or exists (select 1 from public.user_roles ur
               where ur.user_id = _uid and ur.role in ('Coordinador', 'Coordinador Supervisor'))
  );
$$;

-- El link personal de una creadora: el que ya tiene o uno nuevo. La campana de
-- lo que sube le llega a quien ya le mandaba links a esa carpeta; si nadie, a
-- la dueña de la carpeta (contenido); si no, a su manager; si no, a quien lo crea.
create or replace function public.drive_link_personal(_creator uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_item uuid;
  v_tenant uuid;
  v_token text;
  v_por uuid;
begin
  if not public.puede_dar_links_subida(v_uid) then
    raise exception 'sin permiso para crear links de subida' using errcode = '42501';
  end if;
  select m.item_id, d.tenant_id into v_item, v_tenant
    from public.drive_carpeta_creadora m
    join public.drive_items d on d.id = m.item_id and d.trashed_at is null
   where m.creator_id = _creator;
  if v_item is null then raise exception 'la creadora no tiene carpeta'; end if;
  if public.drive_mi_rol(v_item) is null and not public.es_dueno(v_uid) then
    raise exception 'sin acceso a esa carpeta' using errcode = '42501';
  end if;

  select token into v_token from public.drive_upload_links
   where item_id = v_item and tipo = 'personal' and activo limit 1;
  if v_token is not null then return v_token; end if;

  select l.created_by into v_por from public.drive_upload_links l
   where l.item_id = v_item and l.created_by is not null order by l.created_at limit 1;
  v_por := coalesce(v_por,
                    (select d.owner_id from public.drive_items d where d.id = v_item),
                    (select c.assigned_manager_profile_id from public.creators c where c.id = _creator),
                    v_uid);

  insert into public.drive_upload_links (item_id, tenant_id, created_by, tipo, creator_id)
  values (v_item, v_tenant, v_por, 'personal', _creator)
  returning token into v_token;
  return v_token;
end;
$$;

-- Crea la carpeta de una creadora que no tiene (con su usuario en mayúsculas,
-- como las demás) dentro de la carpeta que el equipo elija, y la deja anotada.
create or replace function public.drive_crear_carpeta_creadora(_creator uuid, _dentro_de uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_nombre text;
  v_tenant uuid;
  v_id uuid;
begin
  if not public.puede_dar_links_subida(v_uid) then
    raise exception 'sin permiso' using errcode = '42501';
  end if;
  if public.drive_mi_rol(_dentro_de) not in ('dueno', 'editor') and not public.es_dueno(v_uid) then
    raise exception 'no puedes crear carpetas ahí' using errcode = '42501';
  end if;
  if exists (select 1 from public.drive_carpeta_creadora m
              join public.drive_items d on d.id = m.item_id and d.trashed_at is null
             where m.creator_id = _creator) then
    raise exception 'la creadora ya tiene carpeta';
  end if;
  select upper(regexp_replace(coalesce(nullif(trim(c.artistic_name), ''), c.name), '\s+', '', 'g'))
    into v_nombre from public.creators c where c.id = _creator and c.tenant_id = public.current_tenant_id();
  if v_nombre is null then raise exception 'la creadora no existe'; end if;
  select tenant_id into v_tenant from public.drive_items where id = _dentro_de and tipo = 'carpeta' and trashed_at is null;
  if v_tenant is null then raise exception 'la carpeta no existe'; end if;

  v_id := public.drive_carpeta_hija(_dentro_de, v_nombre, null);
  insert into public.drive_carpeta_creadora (creator_id, item_id, tenant_id, asignado_por)
  values (_creator, v_id, v_tenant, v_uid)
  on conflict (creator_id) do update set item_id = excluded.item_id, asignado_por = excluded.asignado_por;
  return v_id;
end;
$$;

-- La lista de «Links de subida → Creadoras»: cada creadora activa con su
-- carpeta, su link personal y lo que ha mandado por link. Dueño/admin y los del
-- Drive completo ven todas (y el teléfono, para abrir el WhatsApp); el resto,
-- las de las carpetas que ve.
create or replace function public.drive_links_de_creadoras()
returns table (
  creator_id uuid, nombre text, artistico text, telefono text,
  carpeta_id uuid, carpeta text, raiz_id uuid, raiz text,
  token text, archivos bigint, bytes bigint, ultimo timestamptz, usado_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select (select auth.uid()) as uid),
  ve_todo as (
    select public.es_admin_o_dueno(yo.uid)
        or exists (select 1 from public.drive_acceso_total_ids() t where t = yo.uid) as v
      from yo
  )
  select c.id, c.name, c.artistic_name,
         case when ve_todo.v then coalesce(nullif(c.phone_e164, ''), nullif(c.whatsapp_number, '')) end,
         d.id, d.nombre, pd.id, pd.nombre,
         l.token, coalesce(a.archivos, 0)::bigint, coalesce(a.bytes, 0)::bigint, a.ultimo, l.usado_at
    from public.creators c
    cross join yo
    cross join ve_todo
    left join public.drive_carpeta_creadora m on m.creator_id = c.id
    left join public.drive_items d on d.id = m.item_id and d.trashed_at is null
    left join public.drive_items pd on pd.id = d.parent_id
    left join public.drive_upload_links l on l.item_id = d.id and l.tipo = 'personal' and l.activo
    left join lateral (
      select count(*) as archivos, sum(x.size) as bytes, max(x.created_at) as ultimo
        from public.drive_aportes x where x.item_id = d.id
    ) a on true
   where yo.uid is not null
     and c.status = 'active'
     and c.tenant_id = public.current_tenant_id()
     and (ve_todo.v or (d.id is not null and public.drive_mi_rol(d.id) is not null))
   order by a.ultimo desc nulls last, coalesce(c.artistic_name, c.name);
$$;

revoke all on function public.puede_dar_links_subida(uuid) from public, anon;
revoke all on function public.drive_link_personal(uuid) from public, anon;
revoke all on function public.drive_crear_carpeta_creadora(uuid, uuid) from public, anon;
revoke all on function public.drive_links_de_creadoras() from public, anon;
grant execute on function public.puede_dar_links_subida(uuid) to authenticated;
grant execute on function public.drive_link_personal(uuid) to authenticated;
grant execute on function public.drive_crear_carpeta_creadora(uuid, uuid) to authenticated;
grant execute on function public.drive_links_de_creadoras() to authenticated;

-- ── Los de antes, ajustados ─────────────────────────────────────────────────

-- El botón «Link para la modelo» del Drive: si la carpeta es de una creadora,
-- entrega SU link personal; si no, el de subir de siempre (nunca un link de
-- invitado ni de ver, que son de la creadora).
create or replace function public.link_subida_de_carpeta(_item_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tenant uuid;
  v_token text;
  v_creadora uuid;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  if not public.puede_dar_links_subida(v_uid) then
    raise exception 'sin permiso para crear links de subida' using errcode = '42501';
  end if;
  if public.drive_mi_rol(_item_id) is null and not public.es_dueno(v_uid) then
    raise exception 'sin acceso a esa carpeta' using errcode = '42501';
  end if;
  select tenant_id into v_tenant from public.drive_items
   where id = _item_id and tipo = 'carpeta' and trashed_at is null;
  if v_tenant is null then raise exception 'la carpeta no existe'; end if;

  select m.creator_id into v_creadora from public.drive_carpeta_creadora m where m.item_id = _item_id limit 1;
  if v_creadora is not null then return public.drive_link_personal(v_creadora); end if;

  select l.token into v_token
    from public.drive_upload_links l
   where l.item_id = _item_id and l.activo and l.tipo in ('subir', 'personal')
   order by (l.tipo = 'personal') desc,
            (select count(*) from public.drive_aportes a where a.token = l.token) desc,
            l.created_at desc
   limit 1;
  if v_token is not null then return v_token; end if;

  insert into public.drive_upload_links (item_id, tenant_id, created_by, nombre)
  values (_item_id, v_tenant, v_uid, null)
  returning token into v_token;
  return v_token;
end;
$$;

-- La lista de links sueltos: solo los de subir (los personales van en la lista
-- de creadoras y los de invitado/ver son de cada creadora).
create or replace function public.drive_links_de_subida()
returns table (
  token text,
  carpeta_id uuid,
  carpeta text,
  padre text,
  creado_por text,
  creado_at timestamptz,
  archivos bigint,
  bytes bigint,
  ultimo timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select (select auth.uid()) as uid),
  ve_todo as (
    select public.es_admin_o_dueno(yo.uid)
        or exists (select 1 from public.drive_acceso_total_ids() t where t = yo.uid) as v
      from yo
  )
  select l.token, d.id, d.nombre, pd.nombre, p.full_name, l.created_at,
         coalesce(a.archivos, 0)::bigint, coalesce(a.bytes, 0)::bigint, a.ultimo
    from public.drive_upload_links l
    join public.drive_items d on d.id = l.item_id and d.trashed_at is null
    left join public.drive_items pd on pd.id = d.parent_id
    left join public.profiles p on p.id = l.created_by
    left join lateral (
      select count(*) as archivos, sum(x.size) as bytes, max(x.created_at) as ultimo
        from public.drive_aportes x where x.token = l.token
    ) a on true
    cross join yo
    cross join ve_todo
   where l.activo
     and l.tipo = 'subir'
     and yo.uid is not null
     and l.tenant_id = public.current_tenant_id()
     and (ve_todo.v or l.created_by = yo.uid)
   order by a.ultimo desc nulls last, d.nombre;
$$;
