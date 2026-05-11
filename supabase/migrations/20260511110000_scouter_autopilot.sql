-- Scouter autopilot — mantiene el bot encolando rondas de discovery
-- mientras no se acabe el budget diario, sin requerir que el user esté
-- en la página. Antes el handleStart del frontend encolaba UN batch y
-- el bot quedaba "idle" cuando el worker terminaba; el user tenía que
-- volver a la página y darle click para arrancar de nuevo.
--
-- Arquitectura:
--   1. Tabla `scouter_autopilot` por tenant guarda el estado (active +
--      paused_reason).
--   2. RPC `scouter_enqueue_autopilot_batch(p_tenant_id)` replica la
--      lógica de handleStart: itera compañías activas con search_config
--      y encola seeds + hashtags. Retorna count.
--   3. Trigger AFTER UPDATE en scouter_jobs: cuando un job de discovery
--      pasa a done/failed Y el tenant queda con 0 activos Y autopilot
--      está prendido Y hay budget → llama la RPC y encola el siguiente
--      batch. La cadena se sostiene sola.
--
-- Pause condition: si la RPC detecta budget agotado al insertar, marca
-- paused_reason='budget' y NO encola. Frontend ve el reason y muestra
-- "Autopilot pausado: budget agotado, vuelve mañana".

-- ─── 1. Tabla ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scouter_autopilot (
  tenant_id      uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  active         boolean NOT NULL DEFAULT true,
  paused_reason  text,
  paused_at      timestamptz,
  last_tick_at   timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scouter_autopilot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scouter_autopilot_tenant" ON public.scouter_autopilot;
CREATE POLICY "scouter_autopilot_tenant" ON public.scouter_autopilot
  FOR ALL
  TO authenticated
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

COMMENT ON TABLE public.scouter_autopilot IS
  'Estado del autopilot del Scouter Assist por tenant. Cuando active=true, un trigger en scouter_jobs encola la siguiente ronda de discovery cuando termina la anterior, hasta que budget se agote.';

-- ─── 2. RPC para encolar un batch ────────────────────────────────────
-- Replica la lógica del frontend handleStart en SQL. Para cada compañía
-- activa con search_config, encola:
--   · discover_seed con el array de seed_accounts (1 job, N handles).
--   · discover_hashtag por cada hashtag (1 job por hashtag).
--
-- Si el row de autopilot tiene paused_reason='budget', no encola — el
-- frontend tiene que limpiar paused_reason explícito (o el budget se
-- resetea con un nuevo day en scouter_apify_budget).

CREATE OR REPLACE FUNCTION public.scouter_enqueue_autopilot_batch(p_tenant_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count       int := 0;
  v_company     record;
  v_seeds       text[];
  v_hashtags    text[];
  v_tag         text;
  v_paused      text;
  v_today_spend numeric;
  v_today_runs  int;
  v_cap         int := 870;  -- mismo cap que budget.ts en el worker
BEGIN
  -- Si está pausado por budget, no hacemos nada hasta que el reason se
  -- limpie (el frontend lo limpia cuando el user le da Start manual).
  SELECT paused_reason INTO v_paused
  FROM scouter_autopilot
  WHERE tenant_id = p_tenant_id;
  IF v_paused = 'budget' THEN
    RETURN 0;
  END IF;

  -- Pre-check de budget: si hoy ya estamos cerca del cap, marcamos
  -- pausado y salimos (sería tirar requests al vacío).
  SELECT runs_count INTO v_today_runs
  FROM scouter_apify_budget
  WHERE day = CURRENT_DATE AND tenant_id = p_tenant_id;
  IF COALESCE(v_today_runs, 0) >= v_cap THEN
    UPDATE scouter_autopilot
    SET paused_reason = 'budget',
        paused_at = NOW(),
        updated_at = NOW()
    WHERE tenant_id = p_tenant_id;
    RETURN 0;
  END IF;

  -- Iterar compañías activas del tenant con search_config.
  FOR v_company IN
    SELECT id, name, search_config
    FROM scouter_companies
    WHERE tenant_id = p_tenant_id
      AND active = true
  LOOP
    -- Extraer seeds y hashtags del JSONB. Cleanup: trim + lowercase +
    -- strip @/# leading.
    SELECT array_agg(DISTINCT lower(regexp_replace(trim(value), '^[@#]+', '')))
    INTO v_seeds
    FROM jsonb_array_elements_text(
      COALESCE(v_company.search_config->'seed_accounts', '[]'::jsonb)
    ) AS t(value)
    WHERE trim(value) <> '';

    SELECT array_agg(DISTINCT lower(regexp_replace(trim(value), '^[@#]+', '')))
    INTO v_hashtags
    FROM jsonb_array_elements_text(
      COALESCE(v_company.search_config->'hashtags', '[]'::jsonb)
    ) AS t(value)
    WHERE trim(value) <> '';

    -- Encolar discover_seed (1 job con todos los handles)
    IF v_seeds IS NOT NULL AND array_length(v_seeds, 1) > 0 THEN
      INSERT INTO scouter_jobs (kind, status, tenant_id, company_id, payload, priority)
      VALUES (
        'discover_seed',
        'queued',
        p_tenant_id,
        v_company.id,
        jsonb_build_object(
          'seeds', to_jsonb(v_seeds),
          'maxLeads', array_length(v_seeds, 1)
        ),
        5
      );
      v_count := v_count + 1;
    END IF;

    -- Encolar 1 hashtag job por hashtag
    IF v_hashtags IS NOT NULL THEN
      FOREACH v_tag IN ARRAY v_hashtags
      LOOP
        INSERT INTO scouter_jobs (kind, status, tenant_id, company_id, payload, priority)
        VALUES (
          'discover_hashtag',
          'queued',
          p_tenant_id,
          v_company.id,
          jsonb_build_object('hashtag', v_tag, 'maxLeads', 30),
          5
        );
        v_count := v_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  -- Marca tick. Si no encolamos nada, igual actualizamos el timestamp
  -- para saber cuándo fue el último intento.
  UPDATE scouter_autopilot
  SET last_tick_at = NOW(),
      updated_at = NOW(),
      -- Si quedó algo encolado limpiamos paused_reason que no sea budget
      paused_reason = CASE
        WHEN v_count > 0 AND paused_reason IS DISTINCT FROM 'budget' THEN NULL
        ELSE paused_reason
      END
  WHERE tenant_id = p_tenant_id;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.scouter_enqueue_autopilot_batch(uuid) IS
  'Encola un batch de discovery (seeds + hashtags) para todas las compañías activas del tenant. Llamado por el trigger del autopilot cuando un job de discovery termina y no quedan más activos.';

-- ─── 3. Trigger sobre scouter_jobs ───────────────────────────────────
-- Cuando un job de discovery se marca como done o failed, chequea si
-- hay que encolar el siguiente batch del autopilot. Solo dispara si:
--   · El job era discover_seed o discover_hashtag (no score_lead,
--     refresh_posts, etc.).
--   · El tenant tiene autopilot activo.
--   · NO quedan jobs queued/running de ese tenant.
--
-- Si esas condiciones se cumplen, llama scouter_enqueue_autopilot_batch.
-- La cadena se sostiene sola: el batch nuevo termina → trigger dispara →
-- siguiente batch, hasta que budget se acabe.

CREATE OR REPLACE FUNCTION public.tg_scouter_autopilot_tick()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int;
  v_active    boolean;
BEGIN
  -- Solo nos interesan transiciones a done/failed de jobs de discovery.
  IF NEW.status NOT IN ('done', 'failed') THEN
    RETURN NEW;
  END IF;
  IF NEW.kind NOT IN ('discover_seed', 'discover_hashtag') THEN
    RETURN NEW;
  END IF;
  -- Solo si el status REALMENTE cambió (evita re-disparos por updates
  -- triviales del worker tipo retry-counters).
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- ¿Autopilot activo para este tenant?
  SELECT active INTO v_active
  FROM scouter_autopilot
  WHERE tenant_id = NEW.tenant_id;
  IF NOT COALESCE(v_active, false) THEN
    RETURN NEW;
  END IF;

  -- ¿Hay todavía jobs de discovery activos del mismo tenant?
  SELECT COUNT(*) INTO v_remaining
  FROM scouter_jobs
  WHERE tenant_id = NEW.tenant_id
    AND status IN ('queued', 'running')
    AND kind IN ('discover_seed', 'discover_hashtag')
    AND id <> NEW.id;
  IF v_remaining > 0 THEN
    RETURN NEW;
  END IF;

  -- Todo limpio — encolá la siguiente ronda. La RPC se encarga de
  -- chequear budget y pausar si corresponde.
  PERFORM scouter_enqueue_autopilot_batch(NEW.tenant_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scouter_jobs_autopilot_after_update ON public.scouter_jobs;
CREATE TRIGGER scouter_jobs_autopilot_after_update
  AFTER UPDATE OF status ON public.scouter_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_scouter_autopilot_tick();

-- ─── 4. Helper para read-only del frontend ───────────────────────────
-- Devuelve la fila del autopilot del tenant actual. Si no existe,
-- la crea con default active=true y la retorna.
CREATE OR REPLACE FUNCTION public.scouter_autopilot_state()
RETURNS TABLE (
  active boolean,
  paused_reason text,
  paused_at timestamptz,
  last_tick_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid := current_tenant_id();
BEGIN
  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO scouter_autopilot (tenant_id, active)
  VALUES (v_tenant, true)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN QUERY
  SELECT sa.active, sa.paused_reason, sa.paused_at, sa.last_tick_at
  FROM scouter_autopilot sa
  WHERE sa.tenant_id = v_tenant;
END;
$$;

COMMENT ON FUNCTION public.scouter_autopilot_state() IS
  'Devuelve el estado actual del autopilot para el tenant del JWT. Crea la fila con active=true si no existe.';
