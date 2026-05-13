-- leadgen_search_fuzzy v2: dedup por model_handle.
--
-- Antes: el autocomplete (Agregar Contacto, AddContactoModal) listaba
-- cada copia de un handle por separado, lo que generaba "demasiados
-- leads" en el dropdown — sobre todo después de duplicados acumulados.
--
-- Ahora: por cada handle, una sola fila. La que se muestra es la de
-- mayor similarity_score; si empata, la más reciente.

CREATE OR REPLACE FUNCTION public.leadgen_search_fuzzy(
  p_query text,
  p_limit integer DEFAULT 20,
  p_min_similarity real DEFAULT 0.2
)
RETURNS TABLE(
  id uuid, model_handle text, ticket_number text, phone_raw text,
  phone_e164 text, country_code text, city text, company text,
  platform text, onlyfans_url text, notes text, lg_user_id uuid,
  status text, created_at timestamp with time zone, similarity_score real
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  q text := lower(trim(p_query));
BEGIN
  IF q IS NULL OR length(q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH scored AS (
    SELECT
      le.id, le.model_handle, le.ticket_number, le.phone_raw, le.phone_e164,
      le.country_code, le.city, le.company, le.platform, le.onlyfans_url,
      le.notes, le.lg_user_id, le.status, le.created_at,
      GREATEST(
        COALESCE(similarity(lower(le.model_handle), q), 0),
        COALESCE(similarity(lower(le.ticket_number), q), 0),
        COALESCE(similarity(lower(le.notes), q), 0),
        COALESCE(similarity(lower(le.phone_e164), q), 0)
      )::real AS similarity_score
    FROM public.leadgen_entries le
    WHERE
      lower(le.model_handle) % q
      OR lower(le.ticket_number) % q
      OR lower(le.notes) % q
      OR lower(le.phone_e164) % q
  ),
  -- Por handle, quedarse con el mejor score (y si empata, el más reciente).
  deduped AS (
    SELECT DISTINCT ON (lower(s.model_handle)) s.*
    FROM scored s
    ORDER BY lower(s.model_handle), s.similarity_score DESC, s.created_at DESC
  )
  SELECT
    d.id, d.model_handle, d.ticket_number, d.phone_raw, d.phone_e164,
    d.country_code, d.city, d.company, d.platform, d.onlyfans_url,
    d.notes, d.lg_user_id, d.status, d.created_at, d.similarity_score
  FROM deduped d
  ORDER BY d.similarity_score DESC, d.created_at DESC
  LIMIT p_limit;
END;
$function$;
