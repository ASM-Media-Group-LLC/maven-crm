CREATE POLICY "Authenticated can delete templates"
ON public.invoice_templates
FOR DELETE
TO authenticated
USING (true);