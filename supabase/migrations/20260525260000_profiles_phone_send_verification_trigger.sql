-- Trigger que dispara un DM de verificación cuando un user guarda su
-- phone_e164 en Settings (INSERT o UPDATE). El DM lo manda la edge
-- function whatsapp-send-verification-dm, vía pg_net (async, no bloquea
-- la transacción).
--
-- Idempotencia: la edge function chequea si el profile ya tiene
-- whatsapp_verified_at NOT NULL y skipea (a menos que force=true). Así
-- si el user actualiza otros campos del profile sin cambiar el phone,
-- no le re-mandamos.
--
-- Caso especial: si el user CAMBIA su phone (de uno verificado a otro),
-- limpiamos whatsapp_verified_at y whatsapp_push_name para forzar la
-- re-verificación. Esto es manejado en el trigger.

CREATE OR REPLACE FUNCTION public.send_whatsapp_verification_on_phone_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  v_token text;
  v_old_phone text;
  v_new_phone text;
BEGIN
  v_old_phone := COALESCE(OLD.phone_e164, '');
  v_new_phone := COALESCE(NEW.phone_e164, '');

  -- No hacemos nada si el phone no cambió.
  IF v_old_phone = v_new_phone THEN
    RETURN NEW;
  END IF;

  -- Si cambió de un número verificado a otro distinto, invalidar la
  -- verificación anterior (el pushName puede ser de otro device/cuenta).
  IF OLD.whatsapp_verified_at IS NOT NULL AND v_new_phone != v_old_phone THEN
    NEW.whatsapp_verified_at := NULL;
    NEW.whatsapp_push_name := NULL;
  END IF;

  -- Si quedó sin phone (NULL), no hay nada que verificar.
  IF NEW.phone_e164 IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener el token del vault. Si no está, loguear y salir — no
  -- queremos romper el UPDATE del user por un problema de config.
  SELECT decrypted_secret INTO v_token
  FROM vault.decrypted_secrets
  WHERE name = 'cron_internal_token';

  IF v_token IS NULL THEN
    RAISE WARNING 'send_whatsapp_verification: cron_internal_token no está en vault, no se manda el DM';
    RETURN NEW;
  END IF;

  -- Dispara la edge function en async (pg_net es fire-and-forget).
  -- La URL del proyecto la hardcodeamos — está pública en el subdomain
  -- de Supabase, no hay que protegerla.
  PERFORM net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/whatsapp-send-verification-dm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', v_token
    ),
    body := jsonb_build_object('user_id', NEW.id::text)
  );

  RETURN NEW;
END;
$$;

-- Trigger BEFORE UPDATE para que podamos modificar NEW.whatsapp_verified_at
-- en el caso de "cambio de phone verificado".
DROP TRIGGER IF EXISTS profiles_phone_send_verification_trigger ON public.profiles;
CREATE TRIGGER profiles_phone_send_verification_trigger
  BEFORE INSERT OR UPDATE OF phone_e164 ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.send_whatsapp_verification_on_phone_change();

COMMENT ON FUNCTION public.send_whatsapp_verification_on_phone_change IS
  'Dispara la edge function whatsapp-send-verification-dm cuando un user carga o cambia su phone_e164. Async via pg_net. Idempotente — la function chequea si ya está verificado y skipea.';
