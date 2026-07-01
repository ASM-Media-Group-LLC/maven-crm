-- Analítica SLA de la bandeja de WhatsApp (P1.3, inspirado en Whaticket → Informes).
-- Tiempo de 1ª respuesta (mediana + promedio), conversaciones respondidas / sin responder,
-- volumen entrante/saliente (humano vs bot), desglose por agente y por línea.
-- Management-only (blu_is_management). Response time = por conversación: del primer entrante
-- del rango a la primera respuesta HUMANA posterior (sender_user_id not null).
create or replace function public.get_wa_inbox_sla(p_from date default null, p_to date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  result jsonb;
  v_from timestamptz := coalesce(p_from, (now() - interval '30 days')::date)::timestamptz;
  v_to   timestamptz := (coalesce(p_to, now()::date) + 1)::timestamptz;  -- fin de día exclusivo
begin
  if not public.blu_is_management(auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with msgs as (
    select m.conversation_id, m.direction, m.sender_user_id, m.sent_at
    from public.wa_conversation_messages m
    where m.sent_at >= v_from and m.sent_at < v_to and m.deleted_at is null
  ),
  vol as (
    select
      count(*) filter (where direction='in') as entrantes,
      count(*) filter (where direction='out' and sender_user_id is not null) as sal_humano,
      count(*) filter (where direction='out' and sender_user_id is null) as sal_bot
    from msgs
  ),
  conv_first_in as (
    select conversation_id, min(sent_at) as first_in
    from msgs where direction='in' group by conversation_id
  ),
  conv_resp as (
    select ci.conversation_id, ci.first_in, c.assigned_to, c.channel_id,
      (select min(o.sent_at) from public.wa_conversation_messages o
        where o.conversation_id = ci.conversation_id
          and o.direction='out' and o.sender_user_id is not null
          and o.sent_at > ci.first_in) as first_out
    from conv_first_in ci
    join public.wa_conversations c on c.id = ci.conversation_id
  ),
  fin as (
    select assigned_to, channel_id,
      case when first_out is not null then round(extract(epoch from (first_out-first_in))/60.0)::int end as resp_min,
      (first_out is not null) as responded
    from conv_resp
  )
  select jsonb_build_object(
    'overall', jsonb_build_object(
      'convos', (select count(*) from fin),
      'entrantes', (select entrantes from vol),
      'sal_humano', (select sal_humano from vol),
      'sal_bot', (select sal_bot from vol),
      'respondidas', (select count(*) from fin where responded),
      'sin_responder', (select count(*) from fin where not responded),
      'pct_respondidas', (select case when count(*)>0 then round(100.0*count(*) filter (where responded)/count(*),1) else 0 end from fin),
      'resp_prom_min', (select round(avg(resp_min))::int from fin),
      'resp_median_min', (select round(percentile_cont(0.5) within group (order by resp_min))::int from fin)
    ),
    'by_agent', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', assigned_to,
        'respondidas', respondidas, 'sin_responder', sin_responder,
        'resp_prom_min', resp_prom_min, 'resp_median_min', resp_median_min
      ) order by (respondidas + sin_responder) desc), '[]'::jsonb)
      from (
        select assigned_to,
          count(*) filter (where responded) as respondidas,
          count(*) filter (where not responded) as sin_responder,
          round(avg(resp_min))::int as resp_prom_min,
          round(percentile_cont(0.5) within group (order by resp_min))::int as resp_median_min
        from fin group by assigned_to
      ) a
    ),
    'by_channel', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'channel_id', channel_id,
        'respondidas', respondidas, 'sin_responder', sin_responder,
        'resp_prom_min', resp_prom_min
      ) order by (respondidas + sin_responder) desc), '[]'::jsonb)
      from (
        select channel_id,
          count(*) filter (where responded) as respondidas,
          count(*) filter (where not responded) as sin_responder,
          round(avg(resp_min))::int as resp_prom_min
        from fin group by channel_id
      ) ch
    )
  ) into result;
  return result;
end;
$$;

grant execute on function public.get_wa_inbox_sla(date, date) to authenticated;
