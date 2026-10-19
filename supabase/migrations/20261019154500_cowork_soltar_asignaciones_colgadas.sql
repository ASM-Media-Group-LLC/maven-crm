-- Soltar asignaciones colgadas: quedaron is_active=true en sesiones ya
-- finalizadas porque la acción endSession del edge no las desactivaba (sí lo
-- hace leaveSession). El 19/10/2026 había 26 filas colgadas (18 personas):
-- la gente arrastraba pertenencia a sesiones viejas y, al entrar a su link,
-- aparecía en la sala/sesión de otro ("se nos mezcló el cowork"). El arreglo
-- del edge (endSession ahora desactiva las asignaciones) evita que vuelva a
-- pasar; esto limpia lo que ya quedó colgado.
--
-- Idempotente: si no hay asignaciones activas en sesiones terminadas, no toca
-- nada. Seguro: una sesión terminada no debe tener a nadie "activo".
update public.cowork_room_assignments a
set is_active = false
from public.cowork_sessions s
where a.session_id = s.id
  and a.is_active = true
  and s.status = 'ended';
