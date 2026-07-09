-- set_creator_kash_type_by_blu — marca creator_business.kash_type ('Massive'/'Plus')
-- para las creadoras cuyos nombres BLU vinieron de una cuenta dada. Lo llama el micro
-- blu-bridge por cuenta (massive/plus) después de importar los ingresos → la columna
-- "Agencia" del Listado (que ya muestra kash_type) se llena sola. Aislada del import de
-- ingresos (no toca plata). Solo management o el micro (service_role).
create or replace function public.set_creator_kash_type_by_blu(p_blu_names text[], p_kash_type text)
returns int language plpgsql security definer set search_path=public as $$
declare v_n int;
begin
  if not (public.blu_is_management(auth.uid())
          or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role','') = 'service_role') then
    raise exception 'forbidden: solo management o el micro (service_role)' using errcode='42501';
  end if;
  if p_kash_type not in ('Massive','Plus') then
    raise exception 'kash_type inválido: %', p_kash_type;
  end if;
  if p_blu_names is null or array_length(p_blu_names,1) is null then return 0; end if;

  with ids as (
    select distinct bm.creator_id
    from public.blu_creator_map bm
    where bm.creator_id is not null
      and lower(bm.blu_name) = any (select lower(x) from unnest(p_blu_names) x)
  ),
  upd as (
    insert into public.creator_business (creator_id, kash_type)
    select creator_id, p_kash_type from ids
    on conflict (creator_id) do update set kash_type = excluded.kash_type
    returning 1
  )
  select count(*) into v_n from upd;
  return v_n;
end; $$;
revoke all on function public.set_creator_kash_type_by_blu(text[],text) from public, anon;
grant execute on function public.set_creator_kash_type_by_blu(text[],text) to service_role, authenticated;
notify pgrst, 'reload schema';
