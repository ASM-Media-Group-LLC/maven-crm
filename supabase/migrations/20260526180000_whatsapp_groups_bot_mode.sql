-- bot_mode: cómo decide el bot cuándo intervenir en el grupo.
--
--   mention: solo cuando alguien escribe @maven / @bot (modo por defecto)
--   always:  escucha todos los mensajes y decide él si vale la pena responder
--   off:     ignora todo el grupo (equivalente a bot_enabled=false, pero más explícito)
--
-- Mantenemos bot_enabled como kill switch global.

ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS bot_mode text NOT NULL DEFAULT 'mention'
  CHECK (bot_mode IN ('mention', 'always', 'off'));

COMMENT ON COLUMN public.whatsapp_groups.bot_mode IS
  'Cómo decide el bot cuándo intervenir: mention (default, solo si lo citan), always (escucha todo y elige), off (ignora todo).';

-- Activamos modo always en el grupo Marketing/Ventas porque el usuario lo pidió 2026-05-26.
UPDATE public.whatsapp_groups
   SET bot_mode = 'always'
 WHERE id = 'd12ec56f-b324-4369-b72d-7540fb930ef6';
