-- Al reasignar un lead, la conversación de WhatsApp NO cambiaba de dueño efectivo.
--
-- El trigger solo escribía la columna LEGACY wa_conversations.assigned_to, pero la
-- visibilidad de la bandeja la resuelve is_wa_assignee() contra la tabla N:N
-- wa_conversation_assignees — que no tocaba. Resultado: el closer viejo conservaba el
-- acceso y el nuevo no lo recibía, EN SILENCIO (nadie ve un error; el chat
-- simplemente no aparece).
--
-- Detectado dos veces: al planear el ruteo por línea (26/08) y hoy en el traspaso de
-- Miguel a María, donde hubo que reasignar 124 conversaciones A MANO. Con Miguel fuera
-- de la empresa eso habría dejado 124 conversaciones que nadie podía ver.
--
-- Verificado en prod: un lead de María cuya conversación NO figuraba a su nombre
-- (assignees = 0) — se reasignó y se devolvió, y quedó en 1 para ella y 0 para el otro.
create or replace function public.wa_sync_conv_on_lead_owner_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.assigned_to is distinct from old.assigned_to then
    -- Columna legacy (la que ya se sincronizaba).
    update public.wa_conversations wc
       set assigned_to = new.assigned_to
      from public.wa_contacts ct
     where ct.closer_creator_id = new.id
       and wc.contact_id = ct.id
       and wc.channel_id is not null
       and wc.assigned_to is distinct from new.assigned_to;

    -- Tabla N:N, que es la que GOBIERNA la visibilidad. Sin esto lo de arriba es
    -- cosmético.
    if new.assigned_to is not null then
      insert into public.wa_conversation_assignees (conversation_id, user_id)
      select wc.id, new.assigned_to
        from public.wa_conversations wc
        join public.wa_contacts ct on ct.id = wc.contact_id
       where ct.closer_creator_id = new.id
         and wc.channel_id is not null
         and not exists (
           select 1 from public.wa_conversation_assignees a
            where a.conversation_id = wc.id and a.user_id = new.assigned_to)
      on conflict do nothing;
    end if;

    -- Y se saca al dueño anterior: si no, sigue viendo un chat que ya no es suyo.
    if old.assigned_to is not null then
      delete from public.wa_conversation_assignees a
       using public.wa_conversations wc
       join public.wa_contacts ct on ct.id = wc.contact_id
       where ct.closer_creator_id = new.id
         and a.conversation_id = wc.id
         and a.user_id = old.assigned_to;
    end if;
  end if;
  return new;
end;
$function$;
