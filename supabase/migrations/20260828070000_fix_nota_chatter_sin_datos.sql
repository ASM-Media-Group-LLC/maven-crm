-- ═══════════════════════════════════════════════════════════════════════════
-- ARREGLO DE LA NOTA: "sin datos" no es un cero, ni un diez.
--
-- La primera version tenia tres fallas que solo se ven mirando los datos reales:
--
-- 1) HORAS DEL DIA QUE NO ERAN DEL DIA. Se leian de chatter_performance con
--    "el snapshot mas reciente", pero esa tabla es un ACUMULADO de un periodo
--    (snapshot_from..snapshot_to): sus clocked_hours pueden ser 160 horas de un
--    mes, que comparadas contra un turno de 8 dan un ratio absurdo. Ahora las
--    horas salen de hubstaff_daily_data, que si tiene una fila por persona y por
--    dia — que ademas es de donde Jhon pidio que salieran.
--
-- 2) VENTAS AUSENTES CONTADAS COMO CERO. chatter_daily_sales no cubre a todo el
--    equipo: hay entre 4 y 12 chatters por dia, no 42. Con COALESCE(...,0) los
--    ~30 restantes quedaban en 0, caian bajo el piso de 100 y se llevaban un
--    2/10 por un dato que nunca se ingirio. Ahora la ausencia de fila es NULL:
--    sin dato no hay nota de ventas. Un 0 solo cuenta si BLU reporto 0.
--
-- 3) UN DIEZ REGALADO. nota_meet arrancaba en 10 y solo bajaba por pausas; como
--    cowork_breaks esta vacia, todos tenian 10, y si ventas y horas eran NULL la
--    nota final era 10/10 para alguien de quien no sabemos nada. Ahora la nota
--    de comportamiento exige evidencia de haber estado en Cowork ese dia.
--
-- Si los tres componentes faltan, la nota queda en NULL. Es el mismo principio
-- que ya costo caro en promolog: "sin datos" no es "no trabajaste".
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_actividad numeric; v_nota_meet numeric; v_nota numeric;
  v_pausa_seg integer; v_estuvo_cowork boolean;
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
    -- ── VENTAS ────────────────────────────────────────────────────────────
    -- SIN COALESCE a proposito: SUM sobre cero filas devuelve NULL, y eso es
    -- justamente lo que queremos decir — "de este dia no tenemos el dato".
    v_ventas := NULL;
    IF r.blu_id IS NOT NULL THEN
      SELECT SUM(total_sales) INTO v_ventas
      FROM public.chatter_daily_sales
      WHERE date = _dia AND blu_employee_id::text = r.blu_id;
    END IF;

    v_esperado := public.chatter_expected_sales(r.identity_id, _dia, cfg.dias_promedio_modelo);

    IF v_ventas IS NULL OR v_esperado <= 0 THEN
      -- Sin venta reportada, o sin modelos asignadas contra que medir, no hay
      -- vara: no se inventa una nota.
      v_ratio := NULL;
      v_nota_ventas := NULL;
    ELSE
      v_ratio := v_ventas / v_esperado;
      v_nota_ventas := public.chatter_score_from_scale(cfg.escala_ventas, v_ratio);
      -- Regla dura de Jhon: por debajo del piso es malo aunque sus modelos den
      -- poco. Solo aplica sobre una venta REPORTADA, nunca sobre una ausente.
      IF v_ventas < cfg.piso_ventas_usd THEN
        v_nota_ventas := LEAST(v_nota_ventas, cfg.nota_si_bajo_piso);
      END IF;
    END IF;

    -- ── TIEMPO ────────────────────────────────────────────────────────────
    -- Hubstaff, por dia. Si esa persona no tiene cuenta de Hubstaff o no fichó,
    -- no hay fila y la nota de tiempo queda sin calcular.
    v_horas := NULL; v_actividad := NULL; v_nota_tiempo := NULL;
    IF r.maven_user_id IS NOT NULL THEN
      SELECT SUM(h.tracked_seconds) / 3600.0, AVG(h.overall_activity)
        INTO v_horas, v_actividad
      FROM public.hubstaff_daily_data h
      JOIN public.hubstaff_members m ON m.hubstaff_user_id = h.hubstaff_user_id
      WHERE m.profile_id = r.maven_user_id AND h.date = _dia;
    END IF;
    IF v_horas IS NOT NULL AND cfg.horas_turno > 0 THEN
      v_nota_tiempo := public.chatter_score_from_scale(cfg.escala_tiempo, v_horas / cfg.horas_turno);
    END IF;

    -- ── COMPORTAMIENTO EN COWORK ──────────────────────────────────────────
    -- Exige evidencia de haber estado. Sin eso no hay 10: hay NULL.
    SELECT EXISTS (
      SELECT 1 FROM public.cowork_room_assignments a
      WHERE a.user_id = r.maven_user_id
        AND (a.assigned_at AT TIME ZONE 'America/Bogota')::date = _dia
    ) INTO v_estuvo_cowork;

    v_pausa_seg := NULL;
    v_nota_meet := NULL;
    IF v_estuvo_cowork THEN
      SELECT COALESCE(SUM(duration_seconds), 0) INTO v_pausa_seg
      FROM public.cowork_breaks
      WHERE user_id = r.maven_user_id
        AND (started_at AT TIME ZONE 'America/Bogota')::date = _dia
        AND NOT auto_closed;
      v_nota_meet := 10;
      IF v_pausa_seg > 3600 THEN v_nota_meet := v_nota_meet - 3;
      ELSIF v_pausa_seg > 1800 THEN v_nota_meet := v_nota_meet - 1;
      END IF;
      v_nota_meet := GREATEST(0, v_nota_meet);
    END IF;

    -- ── NOTA FINAL ────────────────────────────────────────────────────────
    -- Solo con los componentes que existen; si no existe ninguno, queda NULL y
    -- la pantalla debe mostrar "sin datos", no un numero.
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
            jsonb_build_object(
              'ratio_ventas', v_ratio,
              'pausa_segundos', v_pausa_seg,
              'actividad_pct', v_actividad,
              'estuvo_en_cowork', v_estuvo_cowork,
              'blu_id', r.blu_id,
              -- Que falto: es lo que le permite a la pantalla decir POR QUE no
              -- hay nota, en vez de mostrar un guion sin explicacion.
              'faltantes', (
                CASE WHEN v_nota_ventas IS NULL THEN jsonb_build_array('ventas') ELSE '[]'::jsonb END
                || CASE WHEN v_nota_tiempo IS NULL THEN jsonb_build_array('horas') ELSE '[]'::jsonb END
                || CASE WHEN v_nota_meet   IS NULL THEN jsonb_build_array('cowork') ELSE '[]'::jsonb END
              )),
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
  'Calcula y guarda la nota diaria de cada chatter activo (por defecto la de AYER, hora Bogota). Horas de hubstaff_daily_data. Un componente sin dato queda NULL y se reparte el peso entre los demas; si faltan los tres, la nota es NULL: sin datos no es cero ni diez.';
