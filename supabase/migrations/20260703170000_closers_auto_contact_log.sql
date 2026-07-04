-- Auto-registro de contacto (Closers) — backend.
-- Cuando un closer le escribe a un lead desde la bandeja (WhatsApp o Telegram), se
-- registra solo el contacto en closer_contact_history (sube el N/6 + los triggers ya
-- existentes recalculan cadencia + last_contact). La cadencia y la sugerencia NO cambian.
--
-- Reglas: solo salientes escritos por una PERSONA (sender_user_id no nulo → el bot, que
-- corre como service_role sin sender_user_id, NO cuenta) · 1 por día por lead+canal · tope
-- de 6 (chequeado ANTES de insertar porque enforce_max_contacts LANZA excepción y rompería
-- el insert del mensaje). Solo si la conversación está ligada a un lead (closer_creator_id).

-- 1) Telegram: ligar la conversación al lead (WhatsApp ya lo tiene vía wa_contacts).
alter table public.tg_conversations
  add column if not exists closer_creator_id uuid references public.closer_creators(id) on delete set null;
create index if not exists idx_tg_conversations_closer_creator on public.tg_conversations(closer_creator_id);

-- 2) Telegram: qué closer (usuario Maven) mandó el saliente — igual que
--    wa_conversation_messages.sender_user_id. La ingesta de entrantes lo deja NULL (es el
--    peer, no un usuario Maven), así que los entrantes nunca disparan el auto-registro.
alter table public.tg_messages
  add column if not exists sender_user_id uuid;

-- 3) Función de auto-registro (una sola, sirve para WA y TG). SECURITY DEFINER para
--    saltar la RLS deny-all de escritura de closer_contact_history (es acción de sistema).
create or replace function public.closers_autolog_contact()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead uuid;
  v_channel text;
  v_cnt int;
begin
  -- solo salientes escritos por una persona (el bot no tiene sender_user_id)
  if NEW.direction <> 'out' or NEW.sender_user_id is null then
    return NEW;
  end if;

  if TG_TABLE_NAME = 'wa_conversation_messages' then
    v_channel := 'WhatsApp';
    select wc.closer_creator_id into v_lead
    from public.wa_conversations conv
    join public.wa_contacts wc on wc.id = conv.contact_id
    where conv.id = NEW.conversation_id;
  else
    v_channel := 'Telegram';
    select tc.closer_creator_id into v_lead
    from public.tg_conversations tc
    where tc.id = NEW.conversation_id;
  end if;

  -- conversación no ligada a un lead del pipeline → no registrar
  if v_lead is null then
    return NEW;
  end if;

  -- 1 por día por lead + canal (un día de gestión = 1 paso; 20 mensajes = 1 contacto)
  if exists (
    select 1 from public.closer_contact_history
    where creator_id = v_lead and channel = v_channel and contact_date::date = current_date
  ) then
    return NEW;
  end if;

  -- tope de 6: enforce_max_contacts LANZA excepción si ya hay 6 → chequear antes para no
  -- romper el insert del mensaje.
  select count(*) into v_cnt from public.closer_contact_history where creator_id = v_lead;
  if v_cnt >= 6 then
    return NEW;
  end if;

  insert into public.closer_contact_history (creator_id, channel, result, notes, created_by)
  values (v_lead, v_channel, 'Pendiente', '(auto)', NEW.sender_user_id);

  return NEW;
exception when others then
  -- el auto-registro NUNCA debe romper el insert del mensaje; ante cualquier fallo, seguir.
  return NEW;
end;
$$;

-- 4) Triggers (uno por tabla de mensajes).
drop trigger if exists autolog_contact on public.wa_conversation_messages;
create trigger autolog_contact
  after insert on public.wa_conversation_messages
  for each row execute function public.closers_autolog_contact();

drop trigger if exists autolog_contact on public.tg_messages;
create trigger autolog_contact
  after insert on public.tg_messages
  for each row execute function public.closers_autolog_contact();
