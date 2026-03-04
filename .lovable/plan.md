

## Revisión de Fase 1 + Plan para Fases 2 y 3

### Estado de Fase 1: COMPLETA

Todo lo planificado está implementado:
- DB: tabla `notifications` con campos v2 (module_origin, priority, status, deep_link_url, required_permission_module, role_target, visibility_scope)
- DB: tabla `notification_preferences` creada (pero sin uso en frontend aún -- eso es Fase 2)
- Hook `useNotifications` con Realtime, filtros, canAccess, mutations (markAsRead, markAllAsRead, archive, archiveAll)
- Deep linking con `resolveDeepLink` helper
- `NotificationBell` con dropdown mejorado, prioridad visual, "Ver todas"
- `NotificationItem` con icono por módulo, dot de prioridad, timestamp, archivo
- Página `/notificaciones` con filtros por módulo, prioridad, estado
- 5 emisores actualizados con los campos v2
- RLS actualizado con soporte role_target

---

### FASE 2: Preferencias de Usuario

**Objetivo**: Permitir a cada usuario configurar qué notificaciones recibe, por módulo y tipo.

#### Hook `useNotificationPreferences.ts` (nuevo)
- CRUD sobre la tabla `notification_preferences`
- Query por `user_id = auth.uid()`
- Mutaciones: toggle módulo, toggle tipo, toggle canal

#### Página `/ajustes/notificaciones` (nueva)
- Layout con sidebar/topbar estándar del sistema
- Secciones agrupadas por módulo (Creadores, Tareas, HR, Finanzas, etc.)
- Dentro de cada módulo, lista de tipos de notificación con toggles:
  - In-app (activo/inactivo)
  - Email (futuro, mostrar como "Próximamente" deshabilitado)
- Toggle global por módulo (activa/desactiva todos los tipos de ese módulo)
- Solo mostrar módulos a los que el usuario tiene acceso (`canAccess`)

#### Tipos de notificación por módulo
Definir constante `NOTIFICATION_TYPES_BY_MODULE`:

```text
Creadores: onboarding_complete, verification_pending, document_missing
Tareas:    task_assignment, task_due_soon, task_completed
HR:        absence_request, contract_expiring, incident_created
Finanzas:  invoice_created, payment_pending, payroll_ready
Eventos:   event_created, event_reminder, guest_confirmed
Tickets:   ticket_assigned, ticket_escalated
```

#### Integración con el motor
- En `useNotifications`, antes de mostrar una notificación, verificar si el usuario la tiene habilitada consultando sus preferences
- Si no hay preferencia guardada, se asume habilitada por defecto (opt-out model)

#### Ruta y sidebar
- Agregar ruta `/ajustes/notificaciones` en `App.tsx`
- Agregar item "Ajustes" en el sidebar (acceso universal, como Dashboard/Messenger)

---

### FASE 3: Automatizaciones (Edge Function + Cron)

**Objetivo**: Generar notificaciones automáticas basadas en condiciones temporales.

#### Edge Function `notification-automations/index.ts` (nueva)
Lógica que ejecuta cada hora via cron:

1. **Tareas vencidas**: Buscar tareas con `due_date < now()` y `status != 'completed'`, generar notificación al asignado con prioridad `high`
2. **Contratos por vencer**: Buscar employees con `contract_end_date` en los próximos 30 días, notificar a usuarios con rol HR
3. **Recordatorios de eventos**: Eventos en las próximas 24h, notificar a invitados confirmados
4. **Tareas sin actividad**: Tareas `in_progress` sin actualización en 7+ días, notificar al asignado

Para evitar duplicados: la function guarda un registro de la última ejecución y usa `created_at > last_run` o un campo `automation_key` en notifications para deduplicar.

#### Tabla `notification_automation_log` (nueva)
```sql
CREATE TABLE notification_automation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_type text NOT NULL,
  last_run_at timestamptz DEFAULT now(),
  records_processed int DEFAULT 0,
  UNIQUE(automation_type)
);
```

#### Cron Job
Usar `pg_cron` + `pg_net` para invocar la edge function cada hora:
```sql
SELECT cron.schedule('notification-automations', '0 * * * *', ...);
```

#### Deduplicación
Agregar campo `automation_key` a `notifications` para prevenir notificaciones duplicadas de la misma automatización sobre el mismo recurso.

---

### Archivos a crear/modificar

| Archivo | Fase | Acción |
|---|---|---|
| `src/hooks/useNotificationPreferences.ts` | 2 | Nuevo: CRUD preferences |
| `src/pages/ajustes/NotificacionesSettings.tsx` | 2 | Nueva página de configuración |
| `src/lib/notificationHelpers.ts` | 2 | Agregar NOTIFICATION_TYPES_BY_MODULE |
| `src/hooks/useNotifications.ts` | 2 | Filtrar por preferences del usuario |
| `src/components/dashboard/DashboardSidebar.tsx` | 2 | Agregar item "Ajustes" |
| `src/App.tsx` | 2 | Agregar ruta `/ajustes/notificaciones` |
| `supabase/functions/notification-automations/index.ts` | 3 | Edge function con lógica de automatizaciones |
| `supabase/config.toml` | 3 | Registrar function |
| Migración SQL | 3 | Tabla `notification_automation_log` + campo `automation_key` + cron job |

