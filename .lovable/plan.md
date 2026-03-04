

## Plan: Sistema Centralizado de Notificaciones v2

Este es un sistema complejo que se debe implementar en fases. Propongo dividirlo en 3 fases incrementales para que cada una sea funcional y testeable.

---

### FASE 1: Base de datos + Motor central + Deep linking (esta implementacion)

### Cambios en Base de Datos

**Reemplazar la tabla `notifications` actual** con una estructura enriquecida via migracion:

```sql
-- Nuevas columnas en notifications
ALTER TABLE notifications ADD COLUMN module_origin text;          -- 'hr', 'finanzas', 'creadores', etc.
ALTER TABLE notifications ADD COLUMN priority text DEFAULT 'medium' CHECK (priority IN ('high','medium','low'));
ALTER TABLE notifications ADD COLUMN status text DEFAULT 'new' CHECK (status IN ('new','read','archived'));
ALTER TABLE notifications ADD COLUMN deep_link_url text;          -- '/tareas?taskId=xxx', '/hr/ausencias', etc.
ALTER TABLE notifications ADD COLUMN required_permission_module text;  -- modulo requerido para ver
ALTER TABLE notifications ADD COLUMN required_permission_submodule text;
ALTER TABLE notifications ADD COLUMN visibility_scope text DEFAULT 'personal' CHECK (visibility_scope IN ('personal','team','global'));
ALTER TABLE notifications ADD COLUMN role_target text;            -- si va dirigida a un rol especifico

-- Migrar is_read a status
UPDATE notifications SET status = CASE WHEN is_read THEN 'read' ELSE 'new' END;

-- Indices para queries frecuentes
CREATE INDEX idx_notifications_user_status ON notifications(user_id, status);
CREATE INDEX idx_notifications_module ON notifications(module_origin);
CREATE INDEX idx_notifications_priority ON notifications(priority);
```

**Nueva tabla `notification_preferences`**:

```sql
CREATE TABLE notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  module text NOT NULL,
  notification_type text NOT NULL,      -- 'task_assignment', 'approval_request', etc.
  channel_in_app boolean DEFAULT true,
  channel_email boolean DEFAULT false,  -- futuro
  is_enabled boolean DEFAULT true,
  UNIQUE(user_id, module, notification_type)
);
```

**Actualizar RLS de notifications**: Filtrar por `user_id = auth.uid()` O por `role_target` matching el rol del usuario (via `has_role` function).

**Habilitar Realtime** en `notifications` para notificaciones instantaneas.

### Cambios en el Hook `useNotifications.ts`

Reescribir completamente:
- Query filtra por `status != 'archived'` en lugar de solo `is_read`
- Suscripcion Realtime via `supabase.channel('notifications')` para recibir inserts en tiempo real sin polling
- Filtrado client-side por permisos: usa `canAccess(n.required_permission_module)` para ocultar notificaciones a las que el usuario no tiene acceso
- Nuevas mutaciones: `markAsRead`, `markAllAsRead`, `archive`, `archiveAll`
- Soporte para filtros: por modulo, prioridad, estado

### Deep Linking - Mapa de rutas

Crear un helper `getNotificationDeepLink(type, reference_type, reference_id)` que retorne la URL correcta:

```text
reference_type  |  deep_link_url
----------------|----------------------------------
task            |  /tareas?taskId={id}
project         |  /tareas?projectId={id}
creator         |  /creadores/{id}
event           |  /eventos?eventId={id}
employee        |  /hr/empleados/{id}
absence         |  /hr/ausencias?id={id}
ticket          |  /tickets?id={id}
invoice         |  /finanzas/facturacion?id={id}
contract        |  /hr/empleados/{id}#contrato
```

En el click de la notificacion: validar `canAccess(required_permission_module)` antes de navegar. Si no tiene permiso, mostrar toast de "Sin acceso".

### Actualizar puntos de emision

Modificar los 5 archivos que actualmente insertan notificaciones para incluir los nuevos campos:
- `useOnboarding.ts` → `module_origin: 'creadores'`, `priority: 'medium'`, `deep_link_url`, `required_permission_module: 'Creadores'`
- `OnboardingWizard.tsx` → igual
- `useTareas.ts` → `module_origin: 'tareas'`, `deep_link_url: '/tareas?taskId=...'`
- `useProjects.ts` → `module_origin: 'tareas'`, `deep_link_url: '/tareas?projectId=...'`
- `VerificationSection.tsx` → `module_origin: 'creadores'`, `priority: 'high'`

### UI del Notification Center

**Topbar dropdown (mejorado)**:
- Indicador de prioridad (dot rojo para high, amarillo para medium)
- Icono contextual por `module_origin` (no solo por `type`)
- Boton "Ver todas" al final que navega a `/notificaciones`

**Nueva pagina `/notificaciones`**:
- Layout con sidebar de filtros (modulo, prioridad, estado, fecha)
- Lista de notificaciones con paginacion
- Acciones batch: marcar leidas, archivar
- Click navega al deep link
- Diseno enterprise: tabla limpia, sin avatares exagerados

### Componentes a crear/modificar

| Archivo | Accion |
|---|---|
| `supabase/migrations/...` | Migracion DB |
| `src/hooks/useNotifications.ts` | Reescribir con Realtime + filtros + permisos |
| `src/lib/notificationHelpers.ts` | Nuevo: deep link resolver, icon mapper, priority helpers |
| `src/components/dashboard/DashboardTopbar.tsx` | Refactorizar seccion de notificaciones a componente separado |
| `src/components/notifications/NotificationBell.tsx` | Nuevo: campana + dropdown mejorado |
| `src/components/notifications/NotificationItem.tsx` | Nuevo: item individual con prioridad + deep link |
| `src/pages/Notificaciones.tsx` | Nuevo: vista completa con filtros |
| `src/App.tsx` | Agregar ruta `/notificaciones` |
| 5 archivos emisores | Actualizar inserts con nuevos campos |

---

### FASE 2 (futura): Preferencias de usuario
- Pagina de configuracion en `/ajustes/notificaciones`
- Toggle por modulo y tipo
- Preparacion canal email

### FASE 3 (futura): Automatizaciones
- Edge function cron para recordatorios
- Digest diario por email
- Alertas criticas separadas

---

### Segmentacion por rol (en Fase 1)

La segmentacion ocurre en 2 capas:
1. **Backend (RLS)**: La politica SELECT filtra por `user_id = auth.uid()` o `role_target` matching el rol del usuario
2. **Frontend (hook)**: `canAccess(required_permission_module)` oculta notificaciones cuyo modulo el usuario no puede ver

Ejemplos practicos:
- Manager: ve notificaciones de Creadores, Ventas, HR de su equipo
- Closer: ve solo asignaciones de closers y ventas
- Employee: ve solo sus tareas personales y mensajes
- Admin: ve todo

