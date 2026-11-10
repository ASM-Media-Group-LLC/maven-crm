-- LINKS DE LAS MODELOS A LA VISTA (Alvaro, 10/11/2026).
--
-- El link público de subida (/aportar/<token>) estaba escondido en Drive →
-- carpeta → ⋮ → Ver detalles, y crear_link_subida crea un link NUEVO cada vez
-- que se toca el botón (YOISNIA terminó con tres). Esto solo AGREGA:
--
--   · link_subida_de_carpeta(carpeta): el link de esa carpeta. Si ya hay uno
--     activo lo devuelve (el más usado y, a igualdad, el más reciente); si no,
--     crea uno. Mismos permisos que crear_link_subida.
--   · drive_links_de_subida(): la lista para la página «Links de las modelos»:
--     cada link activo con su carpeta, dónde está, quién lo creó y lo recibido
--     (archivos, peso, último envío). Dueño/admin y los del Drive completo ven
--     todos los de la agencia; el resto, los que creó.

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
  v_nivel text;
  v_puede boolean;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  select nivel into v_nivel from public.profiles where id = v_uid;
  -- Igual que crear_link_subida, más cualquier dueño de la agencia (tenant_owners)
  -- aunque su nivel diga otra cosa.
  v_puede := coalesce(v_nivel in ('dueno', 'admin', 'manager', 'supervisor'), false)
    or public.es_dueno(v_uid)
    or exists (select 1 from public.user_roles ur
               where ur.user_id = v_uid and ur.role in ('Coordinador', 'Coordinador Supervisor'));
  if not v_puede then raise exception 'sin permiso para crear links de subida' using errcode = '42501'; end if;
  if public.drive_mi_rol(_item_id) is null and not public.es_dueno(v_uid) then
    raise exception 'sin acceso a esa carpeta' using errcode = '42501';
  end if;
  select tenant_id into v_tenant from public.drive_items
   where id = _item_id and tipo = 'carpeta' and trashed_at is null;
  if v_tenant is null then raise exception 'la carpeta no existe'; end if;

  -- El que ya existe: así el mismo botón no fabrica duplicados.
  select l.token into v_token
    from public.drive_upload_links l
   where l.item_id = _item_id and l.activo
   order by (select count(*) from public.drive_aportes a where a.token = l.token) desc, l.created_at desc
   limit 1;
  if v_token is not null then return v_token; end if;

  insert into public.drive_upload_links (item_id, tenant_id, created_by, nombre)
  values (_item_id, v_tenant, v_uid, null)
  returning token into v_token;
  return v_token;
end;
$$;

revoke all on function public.link_subida_de_carpeta(uuid) from public, anon;
grant execute on function public.link_subida_de_carpeta(uuid) to authenticated;

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
     and yo.uid is not null
     and l.tenant_id = public.current_tenant_id()
     and (ve_todo.v or l.created_by = yo.uid)
   order by a.ultimo desc nulls last, d.nombre;
$$;

revoke all on function public.drive_links_de_subida() from public, anon;
grant execute on function public.drive_links_de_subida() to authenticated;
