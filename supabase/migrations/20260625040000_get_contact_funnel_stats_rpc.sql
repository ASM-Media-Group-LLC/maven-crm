-- Backbone del dashboard de Contactos: TODO el funnel en 1 llamada, server-side (agregados
-- → sin cap de 1000). Misma clasificación lifecycle que get_contact_statuses (fuente única
-- de la verdad). p_from/p_to filtran closers_contacts.created_at (null = todo el histórico);
-- churn y activas_hoy son estado ACTUAL (no se filtran por fecha).
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
revoke all on function public.get_contact_funnel_stats(date, date) from public, anon;
grant execute on function public.get_contact_funnel_stats(date, date) to authenticated;
