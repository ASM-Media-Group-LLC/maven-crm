-- ═══════════════════════════════════════════════════════════════════════════
-- SALIR DE LA REUNIÓN TERMINA LA ADMISIÓN DEL INVITADO
--
-- Pedido de Jhon (09/09/2026): "el botón volver a entrar, al darle debería
-- volver a pedir autorización y no entrar como si nada".
--
-- Hasta ahora la admisión era para siempre: la fila quedaba en 'admitted' y el
-- navegador del invitado guardaba su token, así que recargar la página —o
-- colgar, que hacía exactamente eso— lo devolvía DERECHO a la llamada sin que
-- nadie volviera a aprobarlo. Con el enlace de la reunión y ese token, un
-- externo podía entrar y salir todo el día.
--
-- Con `left_at`, salir cierra esa admisión: el token guardado deja de servir y
-- volver a entrar es una solicitud NUEVA, que alguien de adentro tiene que
-- aprobar otra vez.
--
-- No se toca el CHECK de `status` a propósito: la fila sigue contando como
-- 'admitted' para el historial (esta persona SÍ estuvo), y `left_at` dice
-- además que esa entrada ya se consumió.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.meet_guest_requests
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

COMMENT ON COLUMN public.meet_guest_requests.left_at IS
  'Cuándo el invitado colgó. Con esto puesto, su token guardado ya no sirve: volver a entrar exige una solicitud nueva y una aprobación nueva.';
