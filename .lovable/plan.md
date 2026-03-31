

## Plan: Corregir sonido de notificaciones + Auditoría del sistema + Resumen del día + Roadmap

### Problema del sonido

El sonido de notificaciones no funciona porque:
1. `playNotificationSound()` solo se llama desde `useBrowserNotifications.notify()`, que **solo se usa en MessengerPage** (chat)
2. El sistema general de notificaciones (`useNotifications.ts`) recibe notificaciones por realtime pero **nunca reproduce sonido**
3. La preferencia `sound_enabled` de `useNotificationSettings` **nunca se consulta** — no hay integración entre la configuración y la reproducción
4. El default de `sound_enabled` es `false`

### Corrección del sonido

#### 1. `useNotifications.ts` — Reproducir sonido al recibir notificación realtime
En el `useEffect` de realtime (línea 85-91), cuando llega una notificación para este usuario:
- Importar `useNotificationSettings` y verificar `settings.sound_enabled`
- Si está habilitado, llamar `playNotificationSound()`
- Respetar también `settings.dnd_enabled` (no sonar en horario DND)

#### 2. `useBrowserNotifications.ts` — Respetar `sound_enabled`
Actualmente `notify()` siempre llama `playNotificationSound()`. Cambiar para que reciba o consulte `sound_enabled` y solo reproduzca si está activo.

#### 3. `useNotificationSettings.ts` — Cambiar default de `sound_enabled`
Cambiar de `false` a `true` para que el sonido funcione por defecto para nuevos usuarios.

---

### Auditoría del sistema — Pendientes para 100% funcional

#### Completado hoy (31 marzo 2026):
1. **LeadGen AgentDetailView** — Scroll interno, paginador y auto-hide de stats cards
2. **LeadGen AgentDetailView** — Acciones funcionales (botón Eye navega al lead)
3. **LeadGen QA** — Tab QA con funcionalidad real: popover de review para supervisores/admins con rating + comentario
4. **LeadGen QA retroalimentación** — Filtro corregido: solo muestra leads con QA review realizado
5. **AgentHourlyPerformance** — KPI cards y quality cards estandarizadas al design system
6. **Auto-hide stats** — Corregido en tabs leads-hora y rendimiento
7. **AgentDetailView datos** — Query propia para cargar TODOS los leads del agente (no solo la página actual)
8. **Badges QA** — Estandarizados con variantes `-soft` del design system
9. **Closers → Creadores** — Acceso granular por submódulo: closers solo ven Lista + Nuevo
10. **Closers → Creadores** — Filtro de ownership: closers solo ven creators que convirtieron
11. **Closers → Creadores** — Columna `created_by` en tabla `creators`
12. **Closers → Creadores** — Botón "Agregar Creador" restaurado + KPI cards filtradas sin Onboarding

#### Pendientes identificados:

| Area | Pendiente | Prioridad |
|------|-----------|-----------|
| **Notificaciones** | Sonido no funciona (este plan lo corrige) | Alta |
| **Notificaciones** | Digests (resúmenes) — UI existe pero no hay Edge Function que los envíe | Media |
| **Notificaciones** | Email channel — pendiente validación de dominio de email | Media |
| **Notificaciones** | Google Calendar sync — pendiente credenciales OAuth del cliente | Baja |
| **Messenger** | Videollamadas/salas — UI existe pero funcionalidad LiveKit puede necesitar testing | Media |
| **LeadGen** | Acciones bulk en tabla de leads (selección múltiple + acción masiva) | Baja |
| **Closers** | Verificar que la conversión a creador (handleConvertToCreator) guarda `created_by` correctamente | Alta |
| **HR/Ausencias** | Edge Function `notify-absence` pendiente de dominio email | Media |
| **Admin** | Auditoría — verificar que todos los eventos críticos se loguean | Baja |

---

### Roadmap actualizado

Se creará/actualizará un archivo `ROADMAP.md` en la raíz del proyecto con las secciones:
- **Completado** — Todo lo hecho hoy
- **En progreso** — Sonido de notificaciones
- **Backlog** — Items pendientes de la auditoría

### Archivos a modificar
- `src/hooks/useNotifications.ts` — Agregar sonido en realtime listener
- `src/hooks/useBrowserNotifications.ts` — Respetar setting `sound_enabled`
- `src/hooks/useNotificationSettings.ts` — Default `sound_enabled: true`
- `ROADMAP.md` — Crear con estado actual del sistema

