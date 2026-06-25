-- FIX de la clasificación lifecycle (colores de fila + KPIs del dashboard, una sola def):
-- 'creator_active' (VERDE) AHORA exige match REAL con una ficha de creadora VIGENTE.
-- Antes, el flag status='converted' o un closer_creator WON (Confirmada/Completada) SIN match
-- de creadora también pintaba verde → marcaba como "creadora" a contactos que nunca lo fueron
-- (58 falsos verdes en prod). Esos casos pasan a 'in_progress' (AMARILLO = en pipeline, sin ficha aún).
--   VERDE = matchea creadora no-ex (active/onboarding/pendiente...)
--   ROJO  = matchea creadora leaving/terminated (fue creadora, ya no activa)
--   AMARILLO = en pipeline (asignada/contactada/converted-flag/WON) pero sin ficha de creadora
-- Aplica a get_contact_statuses + get_contact_funnel_stats + get_contact_funnel_list (misma def).
-- Tras crear/replace funciones via MCP, correr: notify pgrst, 'reload schema';

-- (1) get_contact_statuses (colores de fila)
create or replace function public.get_contact_statuses()
returns jsonb language plpgsql security definer set search_path = public as $$
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
$$;

-- (2) get_contact_funnel_stats (KPIs)
create or replace function public.get_contact_funnel_stats(p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
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
$$;

-- (3) get_contact_funnel_list (popups)
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
$$;
