

## Sistema de Notificaciones v2 — Estado completo

### FASE 1: COMPLETA ✅
- DB: tabla `notifications` con campos v2
- DB: tabla `notification_preferences`
- Hook `useNotifications` con Realtime, filtros, canAccess
- Deep linking con `resolveDeepLink`
- NotificationBell + NotificationItem + página `/notificaciones`
- 5 emisores actualizados
- RLS con soporte role_target

### FASE 2: COMPLETA ✅
- Hook `useNotificationPreferences` con CRUD y opt-out model
- `NOTIFICATION_TYPES_BY_MODULE` en notificationHelpers.ts
- Página `/ajustes/notificaciones` con toggles por módulo y tipo
- Integración de preferences en useNotifications (filtrado)
- Sidebar: "Ajustes" → `/ajustes/notificaciones`
- Email marcado como "Próximamente"

### FASE 3: COMPLETA ✅
- Edge function `notification-automations` desplegada
- Automatizaciones: tareas vencidas, tareas sin actividad, recordatorios de eventos
- Tabla `notification_automation_log` para tracking
- Campo `automation_key` con índice único para deduplicación
- Registrada en `supabase/config.toml`
- Pendiente: configurar cron job con `pg_cron` + `pg_net` para ejecución horaria
