-- Messenger: recibos "entregado" además de "leído" (modelo WhatsApp: ✓ enviado →
-- ✓✓ gris entregado → ✓✓ azul leído). chat_read_receipts pasa de solo-read a
-- delivered_at + read_at (nullable): una fila puede estar entregada sin leer aún.
ALTER TABLE public.chat_read_receipts ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.chat_read_receipts ALTER COLUMN read_at DROP NOT NULL;

-- Backfill: todo lo que ya estaba leído, obviamente fue entregado.
UPDATE public.chat_read_receipts SET delivered_at = read_at WHERE delivered_at IS NULL AND read_at IS NOT NULL;

-- La transición entregado→leído es un UPDATE de la fila (antes el read era insert-only
-- con ON CONFLICT DO NOTHING, por eso no existía policy de UPDATE). Se agrega.
DROP POLICY IF EXISTS "Users can update their own receipts" ON public.chat_read_receipts;
CREATE POLICY "Users can update their own receipts" ON public.chat_read_receipts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
