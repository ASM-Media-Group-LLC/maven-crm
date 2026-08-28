-- registrar_contacto al allowlist de los dos bots cuyo equipo contacta leads.
--
-- ⚠️ Una tool que existe en código pero NO está en wa_bots.tool_allowlist es
-- invocable en CERO grupos. Ya pasó antes con el itinerario.
--
-- Ventas es donde falta: 45 mensajes de llamadas/reuniones en agosto, 18 quedaron
-- como cita y CERO como contacto — el bot no tenía forma de escribir
-- closer_contact_history (cero inserts en toda la edge function; el único writer era
-- el frontend). Warming va también porque Daniel reporta contactos a diario.
-- Managers y Clari NO: no trabajan el pipeline de closers.
update public.wa_bots
   set tool_allowlist = tool_allowlist || '["registrar_contacto"]'::jsonb
 where id in ('8cf0a857-aabc-4a20-a0b9-43e54dacbcaa',   -- Ventas / Marketing
              '8b31542c-9c29-43b3-9137-ab11c3b557fb')   -- AI Warming
   and not (tool_allowlist ? 'registrar_contacto');

-- La instrucción de cuándo usarla: Warming la lleva en su manual de DB; Ventas en
-- MANUAL_VENTAS del código, porque su manual_prompt es NULL.
update public.wa_bots
   set manual_prompt = coalesce(manual_prompt,'') || E'\n\nREGISTRAR LO QUE PASO: cada vez que alguien cuente que contacto a una lead y diga en que quedo — "le escribi y no contesto", "me respondio", "me paso el numero" — llama registrar_contacto con el canal, el resultado y la nota textual. Es lo que mueve last_contact_date y ordena la cadencia de seguimiento. Sin eso el trabajo existe en el chat y no en Maven. NO cambies el stage por haber contactado: contactar no es avanzar el embudo.'
 where id = '8b31542c-9c29-43b3-9137-ab11c3b557fb'
   and manual_prompt not ilike '%registrar_contacto%';
