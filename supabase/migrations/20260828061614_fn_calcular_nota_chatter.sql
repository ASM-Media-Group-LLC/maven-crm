-- Lo que se espera de un chatter un dia: la suma de lo que producen SUS modelos
-- en promedio. Se mira la ventana previa al dia (no incluye el dia evaluado,
-- para no compararlo contra si mismo).
CREATE OR REPLACE FUNCTION public.chatter_expected_sales(_identity uuid, _dia date, _dias integer DEFAULT 30)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH modelos AS (
    SELECT DISTINCT blu_model_id
    FROM public.chatter_creator_assignment_daily
    WHERE identity_id = _identity AND dia = _dia
  ),
  prom AS (
    SELECT m.blu_model_id,
           COALESCE(AVG(s.net_sales), 0) AS promedio
    FROM modelos m
    LEFT JOIN public.sophie_daily_stats s
      ON s.blu_model_id = m.blu_model_id
     AND s.date >= _dia - _dias
     AND s.date < _dia
    GROUP BY m.blu_model_id
  )
  SELECT COALESCE(SUM(promedio), 0) FROM prom;
$$;

COMMENT ON FUNCTION public.chatter_expected_sales(uuid, date, integer) IS
  'Vara del dia: suma del promedio de los ultimos N dias de cada modelo asignada. Es lo que hace que 400 sea malo para uno y bueno para otro.';

-- Traduce un ratio a nota usando la escala de la config (primera que cumple).
CREATE OR REPLACE FUNCTION public.chatter_score_from_scale(_escala jsonb, _ratio numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (SELECT (e->>'nota')::numeric
     FROM jsonb_array_elements(_escala) e
     WHERE _ratio >= (e->>'ratio')::numeric
     ORDER BY (e->>'ratio')::numeric DESC
     LIMIT 1),
    0);
$$;

-- Calcula y GUARDA la nota de un dia para todos los chatters activos.
CREATE OR REPLACE FUNCTION public.calcular_notas_chatters(_dia date DEFAULT (now() AT TIME ZONE 'America/Bogota')::date - 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg public.chatter_score_config%ROWTYPE;
  r record;
  v_esperado numeric; v_ventas numeric; v_ratio numeric;
  v_nota_ventas numeric; v_horas numeric; v_nota_tiempo numeric;
  v_nota_meet numeric; v_nota numeric;
  v_pausa_seg integer; v_sin_rostro boolean; v_compartio boolean;
  n integer := 0;
BEGIN
  SELECT * INTO cfg FROM public.chatter_score_config WHERE id = 1;

  FOR r IN
    SELECT i.id AS identity_id, i.maven_user_id,
           (SELECT l.external_id FROM public.chatter_identity_link l
            WHERE l.identity_id = i.id AND l.source = 'blu' AND l.valid_to IS NULL
            LIMIT 1) AS blu_id
    FROM public.chatter_identity i
    WHERE i.active AND i.is_chatter
  LOOP
    -- VENTAS del dia (lo que BLU reporta para ese empleado).
    SELECT COALESCE(SUM(total_sales), 0) INTO v_ventas
    FROM public.chatter_daily_sales
    WHERE date = _dia AND r.blu_id IS NOT NULL AND blu_employee_id::text = r.blu_id;

    v_esperado := public.chatter_expected_sales(r.identity_id, _dia, cfg.dias_promedio_modelo);

    -- Sin modelos asignadas no hay vara: no se inventa una nota.
    IF v_esperado <= 0 THEN
      v_ratio := NULL;
      v_nota_ventas := NULL;
    ELSE
      v_ratio := v_ventas / v_esperado;
      v_nota_ventas := public.chatter_score_from_scale(cfg.escala_ventas, v_ratio);
      -- Regla dura: por debajo del piso es malo aunque sus modelos den poco.
      IF v_ventas < cfg.piso_ventas_usd THEN
        v_nota_ventas := LEAST(v_nota_ventas, cfg.nota_si_bajo_piso);
      END IF;
    END IF;

    -- TIEMPO: horas fichadas contra el turno.
    v_horas := NULL;
    v_nota_tiempo := NULL;
    IF r.blu_id IS NOT NULL THEN
      SELECT (metrics->>'clockedHours')::numeric INTO v_horas
      FROM public.chatter_performance
      WHERE blu_employee_id::text = r.blu_id
      ORDER BY imported_at DESC LIMIT 1;
    END IF;
    IF v_horas IS NOT NULL AND cfg.horas_turno > 0 THEN
      v_nota_tiempo := public.chatter_score_from_scale(cfg.escala_tiempo, v_horas / cfg.horas_turno);
    END IF;

    -- MEET: se parte de 10 y se descuenta por lo que se ve en Cowork.
    v_nota_meet := 10;
    SELECT COALESCE(SUM(duration_seconds), 0) INTO v_pausa_seg
    FROM public.cowork_breaks
    WHERE user_id = r.maven_user_id
      AND (started_at AT TIME ZONE 'America/Bogota')::date = _dia
      AND NOT auto_closed;
    IF v_pausa_seg > 3600 THEN v_nota_meet := v_nota_meet - 3;
    ELSIF v_pausa_seg > 1800 THEN v_nota_meet := v_nota_meet - 1;
    END IF;
    v_nota_meet := GREATEST(0, v_nota_meet);

    -- Nota final: solo con los componentes que existen ese dia.
    SELECT SUM(peso * nota) / NULLIF(SUM(peso), 0) INTO v_nota
    FROM (VALUES
      (cfg.peso_ventas, v_nota_ventas),
      (cfg.peso_tiempo, v_nota_tiempo),
      (cfg.peso_meet, v_nota_meet)
    ) AS t(peso, nota)
    WHERE nota IS NOT NULL;

    INSERT INTO public.chatter_daily_score AS d
      (dia, identity_id, ventas, ventas_esperadas, nota_ventas, horas, nota_tiempo, nota_meet, nota, detalle, config_snapshot)
    VALUES (_dia, r.identity_id, v_ventas, v_esperado, v_nota_ventas, v_horas, v_nota_tiempo, v_nota_meet,
            ROUND(v_nota, 2),
            jsonb_build_object('ratio_ventas', v_ratio, 'pausa_segundos', v_pausa_seg, 'blu_id', r.blu_id),
            to_jsonb(cfg))
    ON CONFLICT (dia, identity_id) DO UPDATE SET
      ventas = EXCLUDED.ventas, ventas_esperadas = EXCLUDED.ventas_esperadas,
      nota_ventas = EXCLUDED.nota_ventas, horas = EXCLUDED.horas,
      nota_tiempo = EXCLUDED.nota_tiempo, nota_meet = EXCLUDED.nota_meet,
      nota = EXCLUDED.nota, detalle = EXCLUDED.detalle,
      config_snapshot = EXCLUDED.config_snapshot, calculada_at = now();

    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

COMMENT ON FUNCTION public.calcular_notas_chatters(date) IS
  'Calcula y guarda la nota diaria de cada chatter activo. Por defecto, la del dia de AYER en hora de Bogota.';
