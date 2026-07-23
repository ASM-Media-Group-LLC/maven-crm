-- tg_messages.source: espejo de wa_conversation_messages.source. Marca el ORIGEN del saliente:
--   'external' = enviado desde OTRO dispositivo con la misma línea (celular / Telegram web),
--                capturado por el listener del gateway (msg.out) → NO tiene emisor Maven.
--   'maven'    = enviado desde la bandeja de Maven (tg-inbox-send / tg-inbox-send-media).
--   null       = entrante (o salientes viejos previos a esta columna).
-- Nota: tg_messages tiene grants a NIVEL TABLA (no por columna como tg_conversations),
-- así que la columna nueva la puede leer 'authenticated' sin un grant explícito.
alter table public.tg_messages add column if not exists source text;
comment on column public.tg_messages.source is 'maven | external (enviado por fuera de Maven: celular/otro dispositivo con la misma línea) | null (entrante). Espejo de wa_conversation_messages.source.';
