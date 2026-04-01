ALTER TABLE public.leadgen_entries 
  ADD COLUMN record_type text NOT NULL DEFAULT 'nuevo';

ALTER TABLE public.closers_contacts 
  ADD COLUMN record_type text NOT NULL DEFAULT 'nuevo';