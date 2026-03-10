-- Drop overly permissive SELECT policy that lets all users see null-user notifications
DROP POLICY IF EXISTS "Authenticated users can view notifications" ON public.notifications;

-- Drop overly permissive UPDATE policy (same issue)
DROP POLICY IF EXISTS "Authenticated users can update notifications" ON public.notifications;