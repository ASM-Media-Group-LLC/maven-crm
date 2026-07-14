-- Causa raíz del "split-brain" entre closers_contacts y closer_creators.
--
-- Los caminos del pipeline "Tomar" (claimLead) y "Asignar" (assignCreator) en
-- frontend/src/pages/closers/hooks/useCloserLeads.ts actualizan SOLO
-- closer_creators y nunca closers_contacts.status. El único camino que
-- sincronizaba era el RPC assign_closer_to_contact. Resultado: leads ya
-- asignados a un closer seguían apareciendo como asignables (status='new') en el
-- diálogo "Asignar Closer" y como disponibles en la pantalla Contactos.
--
-- Este trigger centraliza la sincronización en la base de datos, así funciona
-- para TODOS los caminos (UI, RPC, scripts, imports):
--   * assigned_to no nulo  → contacto 'converted' (sale del pool de asignables),
--                            mismo criterio que assign_closer_to_contact.
--   * de vuelta al pool (sin dueño y stage='Nuevo') → contacto 'new' otra vez.
--
-- No recursivo: el trigger existente sync_closers_contact_update solo actualiza
-- handle/company/category/phone/notes de closer_creators (nunca assigned_to ni
-- stage), por lo que el UPDATE de status de acá no vuelve a disparar este trigger
-- (que escucha AFTER INSERT OR UPDATE OF assigned_to, stage).
CREATE OR REPLACE FUNCTION public.sync_contact_status_from_closer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.source_contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_to IS NOT NULL THEN
    UPDATE public.closers_contacts
      SET status = 'converted'
      WHERE id = NEW.source_contact_id
        AND coalesce(status, '') <> 'converted';
  ELSIF NEW.stage = 'Nuevo' THEN
    UPDATE public.closers_contacts
      SET status = 'new'
      WHERE id = NEW.source_contact_id
        AND status = 'converted';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_contact_status_from_closer ON public.closer_creators;
CREATE TRIGGER trg_sync_contact_status_from_closer
AFTER INSERT OR UPDATE OF assigned_to, stage ON public.closer_creators
FOR EACH ROW EXECUTE FUNCTION public.sync_contact_status_from_closer();
