

## Plan: Estandarizar Auditoría de Roles y completar funcionalidades de gestión RBAC

### Problemas de layout/estructura identificados

1. **AuditoriaSummaryCards usa divs manuales** en vez de `DashboardMetricCard` — sin hover estándar
2. **Inconsistencia de header entre AdminUsuarios y AuditoriaRoles**:
   - AdminUsuarios: `text-2xl font-bold` (incorrecto según estándar)
   - AuditoriaRoles: `text-xl font-semibold` (correcto)
   - Ambas deberían usar `text-xl font-semibold`
3. **Tabs en posición diferente**: En Auditoría están en el header fijo; en AdminUsuarios están en el área scrolleable. Según el estándar (Header → KPIs → Tabs → Filtros), los tabs van después de los KPIs en el área scrolleable
4. **Sin navegación de retorno**: Auditoría no tiene breadcrumb ni ArrowLeft para volver a AdminUsuarios
5. **AdminUsuarios usa `min-h-screen`** en vez del estándar `h-screen overflow-hidden`

### Funcionalidades faltantes para RBAC robusto

6. **Sin log de auditoría de cambios**: Cuando se cambia un rol, se elimina un usuario o se modifican permisos, no queda registro. Se necesita una tabla `audit_log` y mostrar el historial en la pestaña de auditoría
7. **La matriz de permisos solo muestra `can_view`**: El `useAuditoriaData` solo mapea `can_access` → `can_view`, dejando `can_create/can_edit/can_delete` siempre en false. La matriz es incorrecta
8. **Sin filtro por rol en la tabla de usuarios de auditoría**: Solo hay búsqueda por nombre, falta filtrar por rol o por estado (con/sin rol)
9. **Sin exportación del reporte de auditoría**: No hay forma de descargar el estado actual de roles/permisos

### Cambios propuestos

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `src/pages/admin/auditoria/AuditoriaSummaryCards.tsx` | Reemplazar divs manuales por `DashboardMetricCard` con prop `color` |
| 2 | `src/pages/admin/AuditoriaRoles.tsx` | Mover tabs al área scrolleable (después de KPIs), agregar breadcrumb de retorno a Admin, ajustar layout a `h-screen overflow-hidden` |
| 3 | `src/pages/admin/AdminUsuarios.tsx` | Fix header: `text-xl font-semibold`, fix container: `h-screen overflow-hidden` |
| 4 | `src/pages/admin/auditoria/useAuditoriaData.ts` | Fix matriz: mapear `can_access` a los 4 permisos granulares según el `data_scope` real, o al menos reflejar correctamente que solo hay `can_access` |
| 5 | `src/pages/admin/AuditoriaRoles.tsx` | Agregar filtro por rol y por estado (con/sin rol) en la pestaña Resumen |
| 6 | Migración SQL | Crear tabla `audit_log` (user_id, action, target_type, target_id, details jsonb, created_at) con trigger en `user_roles` para registrar cambios automáticamente |
| 7 | `src/pages/admin/auditoria/useAuditoriaData.ts` | Agregar query de `audit_log` al fetch de datos |
| 8 | `src/pages/admin/auditoria/AuditoriaActivityLog.tsx` | Nuevo componente: timeline de cambios recientes (quién cambió qué rol, cuándo) |
| 9 | `src/pages/admin/AuditoriaRoles.tsx` | Agregar pestaña "Actividad" con el log de cambios |

### Detalle técnico

**Tabla `audit_log`**:
```sql
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,           -- 'role_assigned', 'role_removed', 'permission_changed', 'user_created', 'user_deleted'
  target_type text not null,      -- 'user', 'role', 'permission'
  target_id text,
  details jsonb default '{}',
  created_at timestamptz default now()
);

-- Trigger en user_roles para auto-log
create or replace function log_role_change() returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    insert into audit_log (user_id, action, target_type, target_id, details)
    values (NEW.user_id, 'role_assigned', 'user', NEW.user_id::text,
            jsonb_build_object('role', NEW.role));
  elsif TG_OP = 'DELETE' then
    insert into audit_log (user_id, action, target_type, target_id, details)
    values (OLD.user_id, 'role_removed', 'user', OLD.user_id::text,
            jsonb_build_object('role', OLD.role));
  end if;
  return coalesce(NEW, OLD);
end;
$$ language plpgsql security definer;
```

**Fix de la matriz**: El sistema actual de `role_permissions` solo tiene `can_access` y `data_scope`, no tiene `can_create/can_edit/can_delete` como columnas separadas. La matriz debería mostrar solo "Acceso" (sí/no) y "Alcance" (all/subordinates/self) por módulo, en vez de fingir 4 columnas CRUD que siempre son falsas.

**AuditoriaSummaryCards → DashboardMetricCard**:
```typescript
// De:
<div className="rounded-lg border bg-card p-4 flex items-center gap-3">...

// A:
<DashboardMetricCard
  label="Total Usuarios"
  value={String(summary.total_users)}
  icon={Users}
  color="primary"
/>
```

**Layout de Auditoría estandarizado**:
```text
┌─────────────────────────────────┐
│ Header fijo (shrink-0)          │
│ ← Breadcrumb: Admin > Auditoría│
│ Auditoría de Roles              │
│ Descripción                     │
├─────────────────────────────────┤
│ Área scrolleable (flex-1)       │
│ ┌─ KPIs (DashboardMetricCard) ─┐│
│ ├─ Tabs [Resumen|Matriz|Log]  ─┤│
│ ├─ Filtros + Search           ─┤│
│ ├─ Contenido                  ─┤│
│ └──────────────────────────────┘│
└─────────────────────────────────┘
```

### Orden de implementación

1. Migración SQL: tabla `audit_log` + trigger en `user_roles`
2. Fix layouts: AuditoriaRoles y AdminUsuarios (header, container, tabs position)
3. AuditoriaSummaryCards → DashboardMetricCard
4. Fix matriz de permisos (mostrar acceso + alcance en vez de CRUD falso)
5. Agregar filtros por rol/estado en tabla de usuarios
6. Componente AuditoriaActivityLog + pestaña "Actividad"

