-- Sala de espera de Meet: que la solicitud del invitado LLEGUE a quien está
-- adentro.
--
-- EL BUG: el panel de admisión (MeetGuestGate) consulta meet_guest_requests
-- UNA vez al entrar y después se apoya en realtime para las solicitudes
-- nuevas. Pero la tabla NO estaba en la publicación `supabase_realtime`, así
-- que el INSERT del `knock` no disparaba nada: quien ya estaba en la reunión
-- nunca veía al invitado, y el invitado quedaba en "esperando" para siempre
-- (hace polling esperando una admisión que nadie podía dar).
--
-- El FIX es sumar la tabla a la publicación. REPLICA IDENTITY FULL para que el
-- filtro por `meet_room_id` funcione también en UPDATE/DELETE (admitir /
-- rechazar), no solo en el INSERT del knock.

ALTER TABLE public.meet_guest_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'meet_guest_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.meet_guest_requests;
  END IF;
END $$;
