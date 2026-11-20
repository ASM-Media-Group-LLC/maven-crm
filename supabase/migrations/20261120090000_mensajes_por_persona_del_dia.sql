-- «LOS NÚMEROS DE HOY» CON PANTALLA PROPIA (Alvaro, 20/11/2026): «Mensajes hoy»
-- y «Respuesta» abren una pantalla con cada persona. messenger_metricas_del_dia
-- solo da el total; esta da lo mismo POR PERSONA (quien escribe): mensajes,
-- conversaciones y cuánto tarda en responder. Mismo filtro que el total: solo
-- admins (y el dueño, que es admin), solo su empresa y solo mensajes de gente
-- (sin sistema ni API). Nunca el contenido.
create or replace function public.messenger_por_persona_del_dia()
returns table (user_id uuid, mensajes integer, conversaciones integer, respuesta_promedio_s numeric)
language sql
stable
security definer
set search_path = public
as $$
  with inicio as (
    select ((now() at time zone 'America/New_York')::date)::timestamp at time zone 'America/New_York' as hoy
  ),
  de_hoy as (
    select m.conversation_id, m.sender_id, m.created_at,
           lag(m.sender_id)  over w as sender_previo,
           lag(m.created_at) over w as fecha_previa
      from public.chat_messages m
      join public.chat_conversations c on c.id = m.conversation_id
     where public.has_role((select auth.uid()), 'admin')
       and c.tenant_id = public.current_tenant_id()
       and m.created_at >= (select hoy from inicio)
       and not m.is_deleted
       and m.type <> 'system'
       and m.api_key_id is null
    window w as (partition by m.conversation_id order by m.created_at, m.id)
  )
  select sender_id, count(*)::int, count(distinct conversation_id)::int,
         avg(extract(epoch from created_at - fecha_previa))
           filter (where sender_previo is not null and sender_previo <> sender_id
                     and created_at - fecha_previa <= interval '4 hours')
    from de_hoy
   where sender_id is not null
   group by sender_id;
$$;
revoke all on function public.messenger_por_persona_del_dia() from public, anon;
grant execute on function public.messenger_por_persona_del_dia() to authenticated;
