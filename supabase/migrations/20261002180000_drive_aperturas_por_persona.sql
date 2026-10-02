-- Drive: «Recientes» es lo que abrí YO, como en Google (Jhon, 02/10).
--
-- Hasta hoy «Recientes» ordenaba por drive_items.last_opened_at, que es UNA
-- fecha por archivo para todos: la cuenta Test veía en sus Recientes los videos
-- que abrió Daniel. Ahora cada apertura se anota por persona. last_opened_at se
-- queda: es lo que decide qué se archiva en frío (NAS), y para eso sí vale
-- cualquiera que lo abra.
--
-- Escribe solo la edge (drive al abrir, oficina-doc al ver), con service_role.
-- La RLS de drive_items sigue mandando: si a alguien le quitan el acceso, el
-- archivo desaparece de sus Recientes aunque la fila siga acá.

CREATE TABLE public.drive_aperturas (
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES public.drive_items(id) ON DELETE CASCADE,
  abierto_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
CREATE INDEX drive_aperturas_recientes_idx ON public.drive_aperturas (user_id, abierto_at DESC);
CREATE INDEX drive_aperturas_item_idx ON public.drive_aperturas (item_id);

ALTER TABLE public.drive_aperturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY drive_aperturas_mias ON public.drive_aperturas FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.drive_aperturas FROM anon, authenticated;
GRANT SELECT ON public.drive_aperturas TO authenticated;

-- Lo que ya había: no se sabe QUIÉN abrió cada archivo. Lo único seguro es lo
-- propio de cada uno (lo subió y lo abrió alguien con acceso: casi siempre él).
INSERT INTO public.drive_aperturas (user_id, item_id, abierto_at)
SELECT i.owner_id, i.id, i.last_opened_at
FROM public.drive_items i
WHERE i.owner_id IS NOT NULL AND i.tipo = 'archivo' AND i.last_opened_at IS NOT NULL
ON CONFLICT DO NOTHING;

--| DROP TABLE IF EXISTS public.drive_aperturas;
