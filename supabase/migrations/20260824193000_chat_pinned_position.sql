-- Orden manual de los chats FIJADOS (arrastrar entre fijados). Cada fijado guarda su
-- posición por usuario. Los chats normales siguen ordenándose por recencia (no se tocan).
ALTER TABLE public.chat_pinned ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Backfill idempotente: por usuario, numerar los fijados existentes por pinned_at (0,1,2,...).
WITH ordered AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY pinned_at, id) - 1 AS rn
  FROM public.chat_pinned
)
UPDATE public.chat_pinned p SET position = o.rn FROM ordered o WHERE p.id = o.id;
