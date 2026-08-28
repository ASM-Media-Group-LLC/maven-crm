-- La regla de "modelos de cada manager" se muda del MOTOR al manual de Managers,
-- y con eso se sueltan 3 tools de los otros tres bots.
--
-- Esa línea la cargaban LOS CUATRO bots en cada llamada, y ORDENA tres tools que solo
-- tienen sentido en Managers (Carolina=Kash Plus / Fabiana=Kash Massive). Por eso
-- get_sub_pricing figuraba "sin usar" en los cuatro: el prompt la mandaba en todos y
-- solo servía en uno. Borrarla de las allowlists sin mover la línea habría dejado al
-- prompt ordenando llamar tools inexistentes.
update public.wa_bots
   set manual_prompt = coalesce(manual_prompt, '') || E'\n\nMODELOS DE CADA MANAGER (regla del owner, SIN excepciones): Carolina = cuenta Kash PLUS · Fabiana = cuenta Kash MASSIVE. "Mis modelos/mis creadoras" de una manager = las de su cuenta Kash (todas tienen manager asignado en Maven con esta regla). PROHIBIDO responder "no sé cuáles son tus modelos": las tools filtran por manager (get_manager_roster_stats, get_sub_pricing con manager, get_promo_day_breakdown) — usa el nombre de quien pregunta.'
 where id = '92a4b76e-b664-4762-9245-761d554023ee';

-- Poda MÍNIMA. De 77 casillas candidatas por "cero usos", solo estas sobrevivieron los
-- cuatro filtros. Las otras 75 se CONSERVAN a propósito — ver el commit.
with quitar(bot_id, tool) as (values
  ('7ab51539-5388-47e1-ba0a-bd8b78cbdebb'::uuid, 'get_sub_pricing'),
  ('8cf0a857-aabc-4a20-a0b9-43e54dacbcaa'::uuid, 'get_sub_pricing'),
  ('8b31542c-9c29-43b3-9137-ab11c3b557fb'::uuid, 'get_sub_pricing'),
  ('8b31542c-9c29-43b3-9137-ab11c3b557fb'::uuid, 'get_manager_roster_stats'),
  ('8b31542c-9c29-43b3-9137-ab11c3b557fb'::uuid, 'get_promo_day_breakdown'),
  ('7ab51539-5388-47e1-ba0a-bd8b78cbdebb'::uuid, 'get_promolog_action_feed'),
  ('7ab51539-5388-47e1-ba0a-bd8b78cbdebb'::uuid, 'check_ig_handles')
)
update public.wa_bots b
   set tool_allowlist = (
     select coalesce(jsonb_agg(t order by ord), '[]'::jsonb)
     from jsonb_array_elements_text(b.tool_allowlist) with ordinality as e(t, ord)
     where t not in (select q.tool from quitar q where q.bot_id = b.id)
   )
 where b.id in (select bot_id from quitar) and b.tool_allowlist is not null;
