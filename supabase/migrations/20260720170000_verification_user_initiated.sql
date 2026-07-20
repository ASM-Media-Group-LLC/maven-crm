-- Verificación de WhatsApp INICIADA POR EL USUARIO (fin de los DMs en frío).
--
-- Incidente 2026-07-20: María cargó su número en Settings → el trigger de profiles
-- disparó (vía pg_net) whatsapp-send-verification-dm → el bot le mandó un DM EN FRÍO
-- con un código a un número que nunca habló con él → la línea del bot (maven-bot) se
-- cayó/flageó minutos después (patrón clásico del anti-spam de WhatsApp: texto con
-- código desde un número desconocido). Ver [whatsapp_ban_baileys_research]: el
-- contacto en frío es EL vector de ban; frío de verdad → Cloud API.
--
-- Nuevo flujo (invertido): Maven genera el código y el USUARIO se lo manda al bot
-- (botón wa.me con el texto pre-escrito). El ingest ya matchea códigos en cualquier
-- DM entrante (claim_whatsapp_verification_code) — no requiere que el bot escriba
-- primero. Resultado: cero salientes en frío, mismo vínculo número↔usuario.
--
-- Este trigger conserva SOLO la parte server-side valiosa: si cambia el número,
-- resetear la verificación. Ya NO llama a ninguna edge function.
create or replace function public.send_whatsapp_verification_on_phone_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(old.phone_e164, '') = coalesce(new.phone_e164, '') then
    return new;
  end if;
  -- Número cambiado/removido → la verificación anterior deja de valer.
  if old.whatsapp_verified_at is not null then
    new.whatsapp_verified_at := null;
    new.whatsapp_push_name := null;
  end if;
  return new;
end;
$$;
