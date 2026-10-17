-- Métricas del Messenger para el Centro de operaciones: UNA fila agregada en
-- el servidor con (a) conversaciones con actividad hoy, (b) mensajes de hoy y
-- (c) tiempo promedio de respuesta (delta entre mensajes consecutivos de
-- DISTINTO remitente en la misma conversación, con tope anti-outlier de 4 h
-- para que un "buenos días" al chat de ayer no infle el promedio).
--
-- SECURITY DEFINER porque la RLS de chat_messages solo deja ver las
-- conversaciones propias y este panel es de TODA la agencia. El gate vive
-- adentro: has_role(admin) + el tenant del que mira; para cualquier otro la
-- consulta no ve filas (devuelve ceros, y el panel solo lo renderiza el admin).
-- "Hoy" corre en America/New_York, la zona del negocio (igual que Promolog).
-- Entra por el índice parcial idx_chat_messages_created_at_desc: lee solo los
-- mensajes del día, nunca la tabla entera (la base es Micro y ya se cayó una
-- vez por consultas que barrían todo — ver 20260917233000).
set local lock_timeout = '5s';

create or replace function public.messenger_metricas_del_dia()
returns table(conversaciones_activas integer, mensajes_hoy integer, respuesta_promedio_s numeric)
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
      from chat_messages m
      join chat_conversations c on c.id = m.conversation_id
     where has_role((select auth.uid()), 'admin')
       and c.tenant_id = current_tenant_id()
       and m.created_at >= (select hoy from inicio)
       and not m.is_deleted
       and m.type <> 'system'
       and m.api_key_id is null
    window w as (partition by m.conversation_id order by m.created_at, m.id)
  )
  select count(distinct conversation_id)::int,
         count(*)::int,
         avg(extract(epoch from created_at - fecha_previa))
           filter (where sender_previo is not null
                     and sender_previo <> sender_id
                     and created_at - fecha_previa <= interval '4 hours')
    from de_hoy;
$$;

revoke all on function public.messenger_metricas_del_dia() from public, anon;
grant execute on function public.messenger_metricas_del_dia() to authenticated;
