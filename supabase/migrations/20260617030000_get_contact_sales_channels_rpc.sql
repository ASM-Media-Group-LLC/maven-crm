-- Canales de venta por contacto (WhatsApp outbound), server-side para que también
-- lo vean managers (no solo admin). SECURITY DEFINER → ve todo el wa_* sin que la
-- RLS recorte; gateada a admin/manager adentro. Devuelve
-- { channels:[{id,label}], rows:[{contact_id,channel_id,last_at}] }.
-- Aplicada vía MCP (get_contact_sales_channels_rpc) el 2026-06-17.
create or replace function public.get_contact_sales_channels()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null
     or not exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('admin','manager')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  result := jsonb_build_object(
    'channels', (
      select coalesce(jsonb_agg(
               jsonb_build_object('id', id, 'label', coalesce(label, evolution_instance, 'Canal'))
               order by coalesce(label, evolution_instance, 'Canal')
             ), '[]'::jsonb)
      from public.wa_channels
    ),
    'rows', (
      select coalesce(jsonb_agg(
               jsonb_build_object('contact_id', t.contact_id, 'channel_id', t.channel_id, 'last_at', t.last_at)
             ), '[]'::jsonb)
      from (
        select cc.source_contact_id as contact_id,
               conv.channel_id,
               max(conv.last_message_at) as last_at
        from public.wa_conversations conv
        join public.wa_contacts wct
          on wct.id = conv.contact_id and wct.closer_creator_id is not null
        join public.closer_creators cc
          on cc.id = wct.closer_creator_id and cc.source_contact_id is not null
        where conv.channel_id is not null
          and exists (
            select 1 from public.wa_conversation_messages m
            where m.conversation_id = conv.id and m.direction = 'out'
          )
        group by cc.source_contact_id, conv.channel_id
      ) t
    )
  );
  return result;
end;
$$;

revoke all on function public.get_contact_sales_channels() from public, anon;
grant execute on function public.get_contact_sales_channels() to authenticated;
