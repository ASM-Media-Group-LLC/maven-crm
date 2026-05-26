-- qa_call_participants — junction de cerradores que participaron en una llamada.
--
-- Modelo anterior: qa_calls.closer_id (uno solo, principal). Apunta a
-- profiles.id (no a qa_closers — la tabla qa_closers tiene su propio id
-- + un profile_id que es lo que se usa como sinónimo).
--
-- Modelo nuevo: cada llamada puede tener N cerradores (un primary + 0..N
-- soportes), cada uno con su participation_pct (suma = 1.0 entre todos
-- los participantes).
--
-- Cómo se calcula participation_pct:
--   - Si solo hay 1 closer (caso típico): pct = 1.0
--   - Si hay 2+ closers: se reparte según audio_metrics.speakers[].talk_ratio,
--     pero NORMALIZADO solo entre closers (no contar al modelo). Ej:
--     Julieth talk_ratio=0.26, Miguel=0.13, modelo=0.6. Solo closers:
--     0.26+0.13=0.39. Julieth=0.26/0.39=0.67, Miguel=0.13/0.39=0.33.
--
-- qa_calls.closer_id se mantiene por compat con código viejo — siempre
-- apunta al primary. La nueva métrica del bot supervisor usa las RPCs
-- closer_closed_calls() / closer_calls_count() definidas acá.

CREATE TABLE IF NOT EXISTS public.qa_call_participants (
  call_id           uuid NOT NULL REFERENCES public.qa_calls(id) ON DELETE CASCADE,
  closer_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role              text NOT NULL CHECK (role IN ('primary', 'support')),
  speaker_label     text,                          -- "Hablante 1", "Hablante 2"...
  participation_pct numeric NOT NULL CHECK (participation_pct >= 0 AND participation_pct <= 1),
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (call_id, closer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS qa_call_participants_one_primary
  ON public.qa_call_participants (call_id)
  WHERE role = 'primary';

CREATE INDEX IF NOT EXISTS qa_call_participants_closer_idx
  ON public.qa_call_participants (closer_id);

ALTER TABLE public.qa_call_participants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.qa_call_participants'::regclass
      AND polname = 'qa_call_participants_tenant'
  ) THEN
    CREATE POLICY qa_call_participants_tenant
      ON public.qa_call_participants
      FOR ALL
      USING (EXISTS (
        SELECT 1 FROM public.qa_calls c
        WHERE c.id = qa_call_participants.call_id
          AND c.tenant_id = current_tenant_id()
      ));
  END IF;
END$$;

-- Backfill: 1 row por qa_call existente con closer_id, role='primary', pct=1.0
INSERT INTO public.qa_call_participants (call_id, closer_id, role, participation_pct)
SELECT id, closer_id, 'primary', 1.0
FROM public.qa_calls
WHERE closer_id IS NOT NULL
ON CONFLICT (call_id, closer_id) DO NOTHING;

-- RPC: suma ponderada de cierres (claude_analysis.call_outcome='cerro')
CREATE OR REPLACE FUNCTION public.closer_closed_calls(
  p_closer_id uuid,
  p_since date DEFAULT (now() - interval '1 day')::date
)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(p.participation_pct), 0)
  FROM public.qa_call_participants p
  JOIN public.qa_calls c ON c.id = p.call_id
  WHERE p.closer_id = p_closer_id
    AND c.call_date >= p_since
    AND (c.claude_analysis->>'call_outcome') = 'cerro';
$$;

GRANT EXECUTE ON FUNCTION public.closer_closed_calls(uuid, date) TO authenticated, service_role, anon;

-- RPC: count de llamadas hechas (cualquier outcome) desde una fecha
CREATE OR REPLACE FUNCTION public.closer_calls_count(
  p_closer_id uuid,
  p_since date DEFAULT (now() - interval '1 day')::date
)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(DISTINCT p.call_id)::integer
  FROM public.qa_call_participants p
  JOIN public.qa_calls c ON c.id = p.call_id
  WHERE p.closer_id = p_closer_id
    AND c.call_date >= p_since;
$$;

GRANT EXECUTE ON FUNCTION public.closer_calls_count(uuid, date) TO authenticated, service_role, anon;

COMMENT ON TABLE public.qa_call_participants IS
  'Participantes de una qa_call. Soporta multi-closer con participation_pct ponderado por talk_ratio de audio_metrics.speakers. Auto-poblado por qa-analyze después del análisis.';
