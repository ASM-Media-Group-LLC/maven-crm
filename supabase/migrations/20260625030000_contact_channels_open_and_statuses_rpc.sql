-- (1) Canales de venta visibles para CUALQUIER autenticado (la página Contactos ya está
-- gateada por permiso). Antes solo admin/manager. Expone label de canal, no PII.
create or replace function public.get_contact_sales_channels()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'forbidden' using errcode = '42501'; end if;
  result := jsonb_build_object(
    'channels', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'label', coalesce(label, evolution_instance, 'Canal'))
               order by coalesce(label, evolution_instance, 'Canal')), '[]'::jsonb)
      from public.wa_channels
    ),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object('contact_id', t.contact_id, 'channel_id', t.channel_id, 'last_at', t.last_at)), '[]'::jsonb)
      from (
        select cc.source_contact_id as contact_id, conv.channel_id, max(conv.last_message_at) as last_at
        from public.wa_conversations conv
        join public.wa_contacts wct on wct.id = conv.contact_id and wct.closer_creator_id is not null
        join public.closer_creators cc on cc.id = wct.closer_creator_id and cc.source_contact_id is not null
        where conv.channel_id is not null
          and exists (select 1 from public.wa_conversation_messages m where m.conversation_id = conv.id and m.direction = 'out')
        group by cc.source_contact_id, conv.channel_id
      ) t
    )
  );
  return result;
end;
$$;

-- (2) Estado de cada contacto para el color de fila (verde=creadora activa, rojo=ex,
-- amarillo=en proceso). Match creadora por handle normalizado (no hay FK).
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
          when c.status = 'converted' or won.cid is not null then 'creator_active'
          when cc.assigned_to is not null or cc.stage = 'Asignada' or c.status in ('contacted','interested') then 'in_progress'
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
revoke all on function public.get_contact_statuses() from public, anon;
grant execute on function public.get_contact_statuses() to authenticated;
