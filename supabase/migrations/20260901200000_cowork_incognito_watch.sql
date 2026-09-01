-- Quién está mirando una sesión Cowork DE INCÓGNITO.
--
-- El observador incógnito es invisible en LiveKit (token hidden, sin membresía)
-- y eso es todo-o-nada: ni los supervisores lo ven. Pero entre ADMINS sí deben
-- verse (pedido de Jhon 01/09): esta tabla es ese registro. La escribe SOLO el
-- edge cowork-session (service_role): un latido al emitir el token incógnito y
-- en cada ping de la vista; sin latido fresco, la fila caduca sola.
--
-- RLS habilitado SIN políticas a propósito: ningún cliente la lee ni escribe
-- directo. El único lector es la acción adminListSessions del edge, que ya
-- exige rol admin — así "visible solo para otro admin" lo garantiza el borde,
-- no el front.
CREATE TABLE public.cowork_incognito_watch (
  session_id uuid NOT NULL REFERENCES public.cowork_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

ALTER TABLE public.cowork_incognito_watch ENABLE ROW LEVEL SECURITY;
