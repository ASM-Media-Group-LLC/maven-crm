-- Crear un link de subida (solo editores/admins/supervisores/manager, con acceso
-- a la carpeta). Info pública del link para la página de subida. (Aplicada por MCP.)
create or replace function public.crear_link_subida(_item_id uuid, _nombre text default null)
returns text
language plpgsql security definer set search_path to 'public'
as $function$
declare v_tenant uuid; v_token text; v_nivel text; v_puede boolean;
begin
  select nivel into v_nivel from public.profiles where id = (select auth.uid());
  v_puede := coalesce(v_nivel in ('dueno','admin','manager','supervisor'), false)
    or exists (select 1 from public.user_roles ur
               where ur.user_id = (select auth.uid())
                 and ur.role in ('Coordinador','Coordinador Supervisor'));
  if not v_puede then raise exception 'sin permiso para crear links de subida'; end if;
  if public.drive_mi_rol(_item_id) is null and not public.es_dueno((select auth.uid())) then
    raise exception 'sin acceso a esa carpeta';
  end if;
  select tenant_id into v_tenant from public.drive_items where id = _item_id;
  if v_tenant is null then raise exception 'la carpeta no existe'; end if;
  insert into public.drive_upload_links(item_id, tenant_id, created_by, nombre)
    values (_item_id, v_tenant, (select auth.uid()), nullif(btrim(_nombre), ''))
    returning token into v_token;
  return v_token;
end
$function$;
grant execute on function public.crear_link_subida(uuid, text) to authenticated;

create or replace function public.link_subida_info(_token text)
returns table(activo boolean, carpeta text, etiqueta text)
language sql stable security definer set search_path to 'public'
as $function$
  select l.activo, di.nombre as carpeta, l.nombre as etiqueta
  from public.drive_upload_links l
  join public.drive_items di on di.id = l.item_id
  where l.token = _token
$function$;
grant execute on function public.link_subida_info(text) to anon, authenticated;
