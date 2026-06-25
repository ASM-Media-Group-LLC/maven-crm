-- Lista de contactos detrás de cada KPI del dashboard de Contactos (para los popups
-- clickeables). Misma clasificación lifecycle que get_contact_funnel_stats → los popups
-- coinciden EXACTO con los conteos. Devuelve hasta 100 filas (display); el conteo real
-- lo da el RPC de stats. p_bucket: pipeline | none | in_progress | creator_active |
-- ex_creator | churn. churn lee creators (saliendo/baja), no closers_contacts.
create or replace function public.get_contact_funnel_list(p_bucket text, p_from date default null, p_to date default null)
returns table(id uuid, name text, handle text, city text, country_code text,
              physical_appearance text, status text, created_at timestamptz, profile_picture_url text)
language plpgsql security definer set search_path = public as $$
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
        when c.status = 'converted' or won.cid is not null then 'creator_active'
        when cc.assigned_to is not null or cc.stage = 'Asignada' or c.status in ('contacted','interested') then 'in_progress'
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
  where case p_bucket
    when 'pipeline' then b.source is distinct from 'import_kash_sheet'
    when 'none' then b.source is distinct from 'import_kash_sheet' and b.lc = 'none'
    when 'in_progress' then b.lc = 'in_progress'
    when 'creator_active' then b.lc = 'creator_active'
    when 'ex_creator' then b.lc = 'ex_creator'
    else false end
  order by cc.created_at desc nulls last
  limit 100;
end;
$$;
revoke all on function public.get_contact_funnel_list(text, date, date) from public, anon;
grant execute on function public.get_contact_funnel_list(text, date, date) to authenticated;
