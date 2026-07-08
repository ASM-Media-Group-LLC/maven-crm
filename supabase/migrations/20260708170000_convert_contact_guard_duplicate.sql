-- convert_contact_to_creator: GUARDA anti-duplicados. Antes insertaba una creadora
-- nueva en cada clic sin chequear si ya existía una con ese handle → duplicados
-- (caso andreaesoto: 3 copias). Ahora, si ya existe una creadora NO terminada con
-- el mismo Instagram (normalizado: sin @, sin URL, case-insensitive), lanza un error
-- claro ('creator_already_exists') que el frontend muestra como popup, en vez de duplicar.
create or replace function public.convert_contact_to_creator(p_contact_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c   public.closers_contacts%rowtype;
  v_new uuid;
  v_norm text;
begin
  if v_uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_c from public.closers_contacts where id = p_contact_id;
  if not found then
    raise exception 'contact_not_found';
  end if;
  if v_c.handle is null or btrim(v_c.handle) = '' then
    raise exception 'missing_handle';
  end if;

  -- Handle normalizado (quita instagram.com/, @, /, espacios).
  v_norm := lower(regexp_replace(v_c.handle, '.*instagram\.com/|[@/ ]', '', 'gi'));

  -- Ya existe como creadora (no terminada) → NO duplicar.
  if exists (
    select 1 from public.creators
    where status is distinct from 'terminated'
      and lower(regexp_replace(coalesce(instagram_handle,''), '.*instagram\.com/|[@/ ]', '', 'gi')) = v_norm
  ) then
    raise exception 'creator_already_exists'
      using errcode = '23505',
            hint = 'Ya existe una creadora con ese Instagram (' || v_c.handle || ').';
  end if;

  insert into public.creators (
    name, instagram_handle, country, category, phone, country_code, email,
    profile_photo_url, source, status, internal_notes, created_by
  ) values (
    v_c.name, v_c.handle, v_c.country_code, v_c.physical_appearance, v_c.phone,
    v_c.country_code, v_c.email, v_c.profile_picture_url, 'contacto', 'pendiente',
    case when v_c.company is not null then 'Compañía: ' || v_c.company else null end,
    v_uid
  ) returning id into v_new;

  update public.closers_contacts set status = 'converted' where id = p_contact_id;
  return v_new;
end;
$$;

revoke all on function public.convert_contact_to_creator(uuid) from public, anon;
grant execute on function public.convert_contact_to_creator(uuid) to authenticated;
notify pgrst, 'reload schema';
