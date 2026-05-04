
CREATE TABLE public.lead_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to lead_notes"
ON public.lead_notes
FOR ALL
USING (true)
WITH CHECK (true);

CREATE INDEX idx_lead_notes_lead_id ON public.lead_notes(lead_id);
