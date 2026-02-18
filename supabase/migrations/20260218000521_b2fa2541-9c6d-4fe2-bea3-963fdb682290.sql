
-- Create agencias table
CREATE TABLE public.agencias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'Discovery',
  pais text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  instagram text,
  website text,
  notas text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agencias ENABLE ROW LEVEL SECURITY;

-- Permissive policy similar to contactos
CREATE POLICY "Allow all access to agencias"
ON public.agencias
FOR ALL
USING (true)
WITH CHECK (true);

-- Auto-update updated_at
CREATE TRIGGER update_agencias_updated_at
BEFORE UPDATE ON public.agencias
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
