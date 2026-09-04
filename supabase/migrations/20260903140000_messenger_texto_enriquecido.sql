-- Messenger: texto enriquecido (negrita, cursiva, subrayado, color, listas, cita, código…).
--
-- Se guardan DOS representaciones, como hace Slack:
--   · content      → texto plano. Sigue siendo la fuente de la vista previa de la
--                    lista, la búsqueda, la detección de menciones y las notificaciones.
--                    NADA de eso se toca.
--   · content_rich → documento JSON de TipTap con el formato.
--
-- Se guarda JSON (no HTML) a propósito: el cliente lo dibuja con un renderizador de
-- lista blanca, así no hay superficie de inyección y los nodos de texto siguen
-- pasando por el resaltado de búsqueda, los enlaces automáticos y las menciones.
-- Un mensaje sin formato deja content_rich en NULL y se dibuja como siempre.
alter table public.chat_messages
  add column if not exists content_rich jsonb;

comment on column public.chat_messages.content_rich is
  'Documento TipTap (JSON) con el formato del mensaje. NULL = mensaje de texto plano. El texto plano vive siempre en content.';
