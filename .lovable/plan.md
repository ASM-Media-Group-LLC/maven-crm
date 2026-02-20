
## Agregar sección RRHH al Sidebar

### Diagnóstico

El sidebar actual (`DashboardSidebar.tsx`) tiene esta estructura:

```text
Menú Principal
  - Dashboard, Contactos, Tareas, Eventos
  - [Creadores] (colapsable)
  - [Ventas] (colapsable)

Operaciones
  - Promolog, LeadGen, Closers, Tickets

Administración (solo admins)
  - Usuarios, Auditoría

Recursos
  - Design System, Docs, Roadmap
```

La sección RRHH **falta completamente** — quedó pendiente en la implementación anterior. Se agrega entre Operaciones y Administración como un nuevo `SidebarGroup` colapsable con el mismo patrón que Creadores y Ventas.

---

### Cambios en `src/components/dashboard/DashboardSidebar.tsx`

**1. Import del icono adicional**

`UserCog` ya está importado. Se necesita agregar `Building2` para Directorio (o usar `Users` que también ya existe). Se usará `UserCog` para el grupo raíz y los iconos existentes para los sub-ítems.

**2. Sub-ítems del módulo RRHH**

```ts
const hrSubItems = [
  { title: "Dashboard", url: "/hr" },
  { title: "Directorio", url: "/hr/directorio" },
  { title: "Ausencias", url: "/hr/ausencias" },
  { title: "Incidentes", url: "/hr/incidentes" },
  { title: "Candidatos", url: "/hr/candidatos" },
];
```

**3. Lógica de estado activo**

```ts
const isHRActive = pathname === "/hr" || pathname.startsWith("/hr/");
```

**4. Nuevo grupo colapsable — igual al patrón de Creadores/Ventas**

- En modo **expandido**: `Collapsible` con `ChevronRight` giratorio, `defaultOpen={isHRActive}`, mismo `group/hrCollapsible` pattern
- En modo **colapsado**: `DropdownMenu` lateral con los sub-ítems

**5. Posición en el sidebar**

Se inserta el nuevo `SidebarGroup` con label "RRHH" **después** del grupo "Operaciones" y **antes** del grupo "Administración" (visible solo para admins).

---

### Estructura final del sidebar

```text
Menú Principal
  - Dashboard, Contactos, Tareas, Eventos
  - [Creadores] → Dashboard / Listado / Onboarding
  - [Ventas] → Dashboard / Reportes / IA Ventas

Operaciones
  - Promolog, LeadGen, Closers, Tickets

RRHH                          ← NUEVO
  - Dashboard (/hr)
  - Directorio (/hr/directorio)
  - Ausencias (/hr/ausencias)
  - Incidentes (/hr/incidentes)
  - Candidatos (/hr/candidatos)

Administración (solo admins)
  - Usuarios, Auditoría

Recursos
  - Design System, Docs, Roadmap
```

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/dashboard/DashboardSidebar.tsx` | Agregar array `hrSubItems`, lógica `isHRActive`, y nuevo `SidebarGroup` "RRHH" con collapsible+dropdown |

Un solo archivo, cambio quirúrgico.
