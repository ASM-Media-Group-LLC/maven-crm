
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_memberships;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_room_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_host_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cowork_screenshare_requests;

ALTER TABLE public.cowork_sessions REPLICA IDENTITY FULL;
