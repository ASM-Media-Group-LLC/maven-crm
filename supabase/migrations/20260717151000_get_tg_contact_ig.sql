-- Botón de IG en la bandeja de TELEGRAM (paridad con WhatsApp, PR #822 + fix
-- de últimos-10). Telegram nunca lo tuvo: acá el teléfono vive en
-- tg_conversations.peer_phone (PII, columna revocada a authenticated), así que
-- la resolución va por RPC SECURITY DEFINER que devuelve SOLO el @IG (nunca el
-- teléfono), igual que get_wa_contact_ig.
--
-- Fuentes, en orden (espejo de get_wa_contact_ig):
--   1) FK directo tg_conversations.closer_creator_id → el lead del pipeline al
--      que está ligada la conversación (lo puebla tg-inbox-open al abrir desde
--      Closers). Es la fuente SIN AMBIGÜEDAD y funciona aunque peer_phone sea
--      NULL — muy común porque Telegram oculta el teléfono del peer.
--   2) lead del pipeline por teléfono (últimos 10 dígitos).
--   3) creadora firmada por teléfono.
-- Visibilidad: SECURITY DEFINER bypassa RLS, así que gateamos a mano igual que
-- la policy tg_conversations_select (tenant + scope global / asignado / co-asignado)
-- para no filtrar el @IG de conversaciones que el caller no puede ver.
create or replace function public.get_tg_contact_ig(p_conversation_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  with ct as (
    select closer_creator_id,
           right(regexp_replace(coalesce(peer_phone, ''), '\D', '', 'g'), 10) as d10
    from public.tg_conversations
    where id = p_conversation_id
      and tenant_id = public.current_tenant_id()
      and (
        public.has_tg_inbox_global_scope(auth.uid())
        or assigned_to = auth.uid()
        or public.is_tg_assignee(id, auth.uid())
      )
  )
  select ig from (
    -- 1) FK directo al lead del pipeline (sin ambigüedad; no depende del teléfono)
    select 1 as pri, cc.instagram_handle as ig
      from ct join public.closer_creators cc on cc.id = ct.closer_creator_id
     where coalesce(cc.instagram_handle, '') <> ''
    union all
    -- 2) lead del pipeline por teléfono (últimos 10 dígitos)
    select 2, cc.instagram_handle
      from ct join public.closer_creators cc
        on length(ct.d10) = 10
       and right(regexp_replace(coalesce(cc.phone, ''), '\D', '', 'g'), 10) = ct.d10
     where coalesce(cc.instagram_handle, '') <> ''
    union all
    -- 3) creadora firmada por teléfono
    select 3, cr.instagram_handle
      from ct join public.creators cr
        on length(ct.d10) = 10
       and right(regexp_replace(coalesce(cr.phone_e164, cr.whatsapp_number, cr.phone, ''), '\D', '', 'g'), 10) = ct.d10
     where coalesce(cr.instagram_handle, '') <> ''
  ) t
  order by pri
  limit 1;
$$;

revoke all on function public.get_tg_contact_ig(uuid) from public, anon;
grant execute on function public.get_tg_contact_ig(uuid) to authenticated;

notify pgrst, 'reload schema';
