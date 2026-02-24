

## Reestructurar Auditoria de Roles al layout estandar

### Problemas actuales

1. **Header con icono**: Usa `ClipboardCheck` en caja junto al titulo, lo cual esta prohibido por el sistema de diseno
2. **Todo apilado sin organizacion**: KPIs, Health Checks, tabla de usuarios y matriz de permisos estan todos en un solo scroll vertical largo
3. **Scroll horizontal**: La matriz de permisos (`AuditoriaRoleMatrix`) tiene `overflow-x-auto` que genera scroll horizontal en la pagina
4. **Sin tabs de navegacion**: No hay forma de separar el contenido en secciones manejables

### Solucion

Reestructurar la pagina con el layout estandar de la plataforma y separar el contenido en dos tabs.

**Header fijo:**
- Titulo: "Auditoria de Roles" (`text-xl font-semibold`, sin icono)
- Subtitulo: "Reporte en tiempo real del estado de roles y permisos"

**Tab bar de navegacion:**
- Tab 1: "Resumen" (KPIs + Health Checks + Tabla de Usuarios con buscador)
- Tab 2: "Matriz de Permisos" (la tabla de permisos por rol, a pantalla completa)

**Contenido del tab "Resumen":**
1. KPIs (5 cards)
2. Health Checks (collapsibles)
3. Buscador de usuarios
4. Tabla de usuarios y roles

**Contenido del tab "Matriz de Permisos":**
1. Tabla de matriz de permisos a ancho completo (sin scroll horizontal innecesario, mejor aprovechamiento del espacio)

### Detalle tecnico

| Archivo | Cambio |
|---------|--------|
| `src/pages/admin/AuditoriaRoles.tsx` | Eliminar icono del header, cambiar a `text-xl font-semibold`, agregar tab bar con dos tabs ("Resumen" y "Matriz de Permisos"), reorganizar contenido en cada tab |

Solo se modifica un archivo. Los componentes hijos (`AuditoriaSummaryCards`, `AuditoriaHealthChecks`, `AuditoriaUsersTable`, `AuditoriaRoleMatrix`) se mantienen sin cambios.

