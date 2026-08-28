-- Override de modelo POR GRUPO.
--
-- Hasta ahora el modelo salía solo de wa_bots.model, y el bot "Clari (privado)"
-- (claude-opus-5) atiende los TRES DMs: Grace, Álvaro y Jhon. O sea que no había
-- forma de bajar uno solo sin mover los tres, ni de clonar el bot sin duplicar
-- manual_prompt y tool_allowlist enteros.
--
-- Contexto medido en agosto: el DM de Grace costó $42 en 79 llamadas = $0,53 cada
-- una, contra $0,088 en Marketing/Ventas y $0,039 en AI WARMING. El 71% son 43
-- disparos de un recordatorio automático que solo TRANSCRIBE un bloque que
-- get_hubstaff_activity ya devuelve calculado — no necesita Opus.
--
-- Y el motivo de fondo de la diferencia: el prefijo del prompt pesa ~64.600 tokens.
-- En un grupo activo se LEE del caché a 0,1x; en un DM esporádico el caché vence
-- entre llamadas y se REESCRIBE a 1,25x. 12x de diferencia en el componente más
-- caro, y encima sobre precio de Opus.
alter table public.whatsapp_groups
  add column if not exists model text;

comment on column public.whatsapp_groups.model is
  'Override de modelo para ESTE grupo. Precedencia: whatsapp_groups.model → wa_bots.model → pickModel(). Sirve para bajar de modelo un grupo suelto sin tocar a los demás que comparten el mismo bot.';

update public.whatsapp_groups
   set model = 'claude-sonnet-5'
 where id = '2f73677e-482b-4e6a-b344-d77498ccceee';  -- DM · Grace Gelves
