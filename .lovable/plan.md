

## Pagina de Auditoria de Roles

### Resumen

Se creara una nueva pagina "Auditoria" dentro del grupo de Administracion en el sidebar, accesible en `/admin/auditoria`. Esta pagina mostrara un reporte en tiempo real del estado de roles y permisos del sistema, generado a partir de consultas a la base de datos (no del JSON estatico). El JSON proporcionado sirve como referencia de la estructura y secciones a mostrar.

---

### Secciones de la pagina

#### 1. KPIs de resumen (cards superiores)
Basado en `summary` del JSON:
- Total de usuarios
- Usuarios con rol asignado
- Usuarios sin rol (resaltado en rojo/warning)
- Total de roles activos
- Total de permisos configurados

#### 2. Health Checks (alertas)
Basado en `health_checks` del JSON:
- Cards de alerta con conteo por severidad (critical, high, medium, low)
- Lista de hallazgos expandible con:
  - Usuarios sin rol asignado (tipo warning)
  - Permisos huerfanos - permisos en `role_permissions` cuyo `role_id` no apunta a un rol valido en `roles_config` (tipo error)
- Cada hallazgo muestra categoria, mensaje, prioridad y usuarios/items afectados

#### 3. Tabla de usuarios con roles
Basado en `users` del JSON:
- Tabla con columnas: nombre, email, rol(es), rol custom (nombre del rol en roles_config)
- Filtrable y con indicador visual para usuarios sin rol

#### 4. Matriz de permisos por rol
Basado en `role_matrix` del JSON:
- Tabla donde las filas son los modulos (creators, tickets, promolog, etc.) y las columnas son los roles (admin, manager, supervisor, agent)
- Cada celda muestra iconos de check/x para can_view, can_create, can_edit, can_delete
- Esto se construira a partir de `role_permissions` + `roles_config`

---

### Seccion tecnica

**Archivos a crear:**
- `src/pages/admin/AuditoriaRoles.tsx` - Pagina principal con layout sidebar + topbar
- `src/pages/admin/auditoria/AuditoriaSummaryCards.tsx` - KPI cards del resumen
- `src/pages/admin/auditoria/AuditoriaHealthChecks.tsx` - Seccion de alertas/hallazgos
- `src/pages/admin/auditoria/AuditoriaUsersTable.tsx` - Tabla de usuarios con sus roles
- `src/pages/admin/auditoria/AuditoriaRoleMatrix.tsx` - Matriz de permisos por rol
- `src/pages/admin/auditoria/useAuditoriaData.ts` - Hook que consulta profiles, user_roles, roles_config y role_permissions para generar el reporte en tiempo real

**Archivos a modificar:**
- `src/components/dashboard/DashboardSidebar.tsx` - Agregar enlace "Auditoria" debajo de "Usuarios" en el grupo Administracion (con icono `ClipboardCheck` o `FileSearch`)
- `src/App.tsx` - Agregar ruta `/admin/auditoria` protegida con `AdminRoute`

**Logica del hook `useAuditoriaData`:**

```text
1. Consultar profiles + user_roles (JOIN) para obtener usuarios con/sin roles
2. Consultar roles_config para roles activos
3. Consultar role_permissions + roles_config para construir la matriz
4. Detectar health checks:
   - Usuarios sin entrada en user_roles -> warning "Usuarios sin rol"
   - role_permissions con role_id que no existe en roles_config -> error "Permiso huerfano"
5. Calcular summary counts
```

**Estructura de la ruta en sidebar:**

```text
Administracion
  |-- Usuarios (/admin/usuarios)
  |-- Auditoria (/admin/auditoria)
```

Ambos enlaces solo visibles para usuarios con rol `admin`.

