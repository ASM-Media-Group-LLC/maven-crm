
ALTER TABLE public.roadmap_items ADD COLUMN completed_at timestamptz;

UPDATE public.roadmap_items SET completed_at = updated_at WHERE status = 'done';
