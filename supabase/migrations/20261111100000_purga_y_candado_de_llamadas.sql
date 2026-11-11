-- LA PURGA DE LA PAPELERA VUELVE A FUNCIONAR (Alvaro, 11/11/2026: «arreglarla y que las borre»).
--
-- app_purgar_cuentas_vencidas (cron «purgar-cuentas-vencidas», 7:00 UTC) fallaba
-- todos los días: al borrar una cuenta, app_purge_user_refs deja en NULL las
-- llamadas donde esa persona llamó o recibió (calls.caller_id / receiver_id), y
-- el candado calls_agencia rechazaba CUALQUIER cambio de esas columnas. 19
-- cuentas con más de 30 días en la papelera quedaron sin purgar.
--
-- Ahora el candado deja pasar a NULL quién llama y a quién (igual que ya dejaba
-- con la conversación): lo único que hace eso es borrar la cuenta. Cambiarlas a
-- OTRA persona sigue prohibido.
--
-- Además se quita el cron «refresh-of-gross-earnings-v2-daily», que llamaba a una
-- función borrada en abril (20260403225429; la reemplazó
-- «cleanup-of-gross-earnings-daily», que sí corre) y fallaba cada noche.

create or replace function public.calls_agencia()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_de_quien_llama uuid;
  v_de_la_conversacion uuid;
begin
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
       -- Quién llama y a quién solo pueden pasar a NULL: es la purga de una cuenta.
       or (new.caller_id is distinct from old.caller_id and new.caller_id is not null)
       or (new.receiver_id is distinct from old.receiver_id and new.receiver_id is not null)
       or new.room_id is distinct from old.room_id
       -- La conversación solo puede pasar a NULL: es la FK (ON DELETE SET NULL).
       or (new.conversation_id is distinct from old.conversation_id and new.conversation_id is not null) then
      raise exception 'calls_agencia: quién llama, a quién, la sala, la conversación y la agencia de una llamada no cambian' using errcode = '42501';
    end if;
    return new;
  end if;

  v_de_quien_llama := (select tm.tenant_id from public.tenant_members tm where tm.user_id = new.caller_id);
  if v_de_quien_llama is null then
    raise exception 'calls_agencia: % no es de ninguna agencia, no puede llamar', new.caller_id using errcode = '42501';
  end if;
  if new.tenant_id is null then
    new.tenant_id := v_de_quien_llama;
  elsif new.tenant_id <> v_de_quien_llama then
    raise exception 'calls_agencia: la llamada tiene que ser de la agencia de quien llama' using errcode = '42501';
  end if;
  -- La sala de una llamada es la de su conversación (useVideoCall): así nadie
  -- se adueña de la sala de una llamada ajena insertando una fila con ella.
  if new.conversation_id is null or new.room_id is distinct from 'call-' || new.conversation_id::text then
    raise exception 'calls_agencia: la sala de una llamada es call-<id de su conversación>' using errcode = '23514';
  end if;
  v_de_la_conversacion := (select c.tenant_id from public.chat_conversations c where c.id = new.conversation_id);
  if v_de_la_conversacion is distinct from v_de_quien_llama then
    raise exception 'calls_agencia: la conversación no es de la agencia de quien llama' using errcode = '42501';
  end if;
  if not exists (select 1 from public.chat_participants p where p.conversation_id = new.conversation_id and p.user_id = new.caller_id) then
    raise exception 'calls_agencia: quien llama no está en la conversación' using errcode = '42501';
  end if;
  if new.receiver_id is not null
     and not exists (select 1 from public.tenant_members tm where tm.user_id = new.receiver_id and tm.tenant_id = v_de_quien_llama) then
    raise exception 'calls_agencia: % no es de la agencia de quien llama', new.receiver_id using errcode = '42501';
  end if;
  return new;
end $function$;

select cron.unschedule(jobid) from cron.job where jobname = 'refresh-of-gross-earnings-v2-daily';
