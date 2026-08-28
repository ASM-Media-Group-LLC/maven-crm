-- Las cuentas con +N en BLU (manuela.zapata+1@unlok.me) son LA MISMA PERSONA:
-- se usan para registrarla en Massive y en Plus con un unico correo. Hoy quedan
-- como identidades separadas, asi que sus ventas y sus horas se reparten en dos
-- notas y ninguna de las dos describe su dia.
--
-- Se fusionan sobre la identidad base y sus dos cuentas de BLU quedan colgando
-- de ella, ambas vigentes: el indice unico es por (source, external_id), asi que
-- una persona puede tener varias cuentas activas sin conflicto.

DO $$
DECLARE
  r record;
  v_base uuid;
BEGIN
  FOR r IN
    SELECT i.id, i.email_local, split_part(i.email_local, '+', 1) AS base_local
    FROM public.chatter_identity i
    WHERE i.email_local LIKE '%+%'
  LOOP
    SELECT id INTO v_base FROM public.chatter_identity
    WHERE email_local = r.base_local AND id <> r.id
    ORDER BY (maven_user_id IS NOT NULL) DESC, created_at
    LIMIT 1;

    IF v_base IS NULL THEN
      -- No hay identidad base: no se fusiona nada, solo se normaliza el correo
      -- para que la proxima cuenta con el mismo dueño caiga sobre esta.
      UPDATE public.chatter_identity SET email_local = r.base_local WHERE id = r.id;
      CONTINUE;
    END IF;

    -- Las cuentas externas pasan a la identidad base.
    UPDATE public.chatter_identity_link SET identity_id = v_base WHERE identity_id = r.id;
    -- Y lo que ya se hubiera calculado sobre la identidad duplicada.
    UPDATE public.chatter_model_daily SET identity_id = v_base WHERE identity_id = r.id
      AND NOT EXISTS (SELECT 1 FROM public.chatter_model_daily x
                      WHERE x.identity_id = v_base AND x.dia = chatter_model_daily.dia
                        AND x.blu_model_id = chatter_model_daily.blu_model_id);
    DELETE FROM public.chatter_model_daily WHERE identity_id = r.id;
    DELETE FROM public.chatter_daily_score WHERE identity_id = r.id;
    DELETE FROM public.chatter_creator_assignment_daily WHERE identity_id = r.id;
    UPDATE public.chatter_mass_messages SET identity_id = v_base WHERE identity_id = r.id;

    DELETE FROM public.chatter_identity WHERE id = r.id;
    RAISE NOTICE 'Fusionada % sobre %', r.email_local, r.base_local;
  END LOOP;
END $$;
