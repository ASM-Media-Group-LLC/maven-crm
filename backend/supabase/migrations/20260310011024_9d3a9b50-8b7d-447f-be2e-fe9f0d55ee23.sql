-- Archive orphaned notifications that have no user targeting
UPDATE public.notifications SET status = 'archived' WHERE user_id IS NULL AND role_target IS NULL AND status != 'archived';