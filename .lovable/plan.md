
## Rediseño del módulo "Recursos Humanos" en el Sidebar

### Objetivo

Tres cambios principales:
1. **Label del grupo**: `"RRHH"` → `"Recursos Humanos"`
2. **Nombre del módulo raíz**: `"RRHH"` → `"Empleados"` (con icono `UserCog`)
3. **Estructura interna**: Reemplazar la lista plana (5 ítems) por la jerarquía de sub-grupos anidada de la imagen de referencia
4. **Sidebar siempre visible**: Revisar páginas HR y asegurar que no usen patrones que oculten el sidebar

---

### Nueva estructura de navegación (basada en la imagen)

```
Recursos Humanos (label del grupo)
  └─ Empleados (raíz colapsable con ChevronRight)
       ├─ Operación Diaria
       │    ├─ Asistencia
       │    ├─ Ausencias → /hr/ausencias
       │    ├─ Vacaciones
       │    ├─ Licencias
       │    ├─ Permisos
       │    └─ Horarios y Turnos
       ├─ Seguimiento y Control
       │    ├─ Incidentes → /hr/incidentes
       │    └─ Monitoreo
       ├─ Desarrollo
       │    ├─ Capacitación → /hr/capacitacion
       │    └─ Desempeño → /hr/desempeno
       ├─ Información
       │    ├─ Directorio → /hr/directorio
       │    └─ Organigrama
       ├─ Reclutamiento
       │    ├─ Candidatos → /hr/candidatos
       │    ├─ Onboarding
       │    └─ Offboarding
       └─ Finanzas Operativas
            └─ Deducciones
```

Los ítems que no tienen página implementada aún (Asistencia, Vacaciones, Licencias, Permisos, Horarios y Turnos, Monitoreo, Organigrama, Onboarding HR, Offboarding, Deducciones) se renderizan como links deshabilitados o con `opacity-50 cursor-not-allowed` para indicar que están "próximamente".

---

### Patrón de implementación

El sidebar actual usa `Collapsible` de Radix para un nivel de anidación. Para la jerarquía de dos niveles (Empleados → Sub-grupo → Ítem) se usa el mismo componente `Collapsible` anidado dentro de `SidebarMenuSub`, siguiendo el patrón que ya existe en el proyecto.

Estructura de datos:

```ts
const hrGroups = [
  {
    label: "Operación Diaria",
    icon: Clock,
    items: [
      { title: "Asistencia", url: null },
      { title: "Ausencias", url: "/hr/ausencias" },
      { title: "Vacaciones", url: null },
      { title: "Licencias", url: null },
      { title: "Permisos", url: null },
      { title: "Horarios y Turnos", url: null },
    ],
  },
  {
    label: "Seguimiento y Control",
    icon: Eye,
    items: [
      { title: "Incidentes", url: "/hr/incidentes" },
      { title: "Monitoreo", url: null },
    ],
  },
  {
    label: "Desarrollo",
    icon: GraduationCap,
    items: [
      { title: "Capacitación", url: "/hr/capacitacion" },
      { title: "Desempeño", url: "/hr/desempeno" },
    ],
  },
  {
    label: "Información",
    icon: Users,
    items: [
      { title: "Directorio", url: "/hr/directorio" },
      { title: "Organigrama", url: null },
    ],
  },
  {
    label: "Reclutamiento",
    icon: UserPlus,
    items: [
      { title: "Candidatos", url: "/hr/candidatos" },
      { title: "Onboarding", url: null },
      { title: "Offboarding", url: null },
    ],
  },
  {
    label: "Finanzas Operativas",
    icon: Wallet,
    items: [
      { title: "Deducciones", url: null },
    ],
  },
];
```

---

### Sidebar siempre visible en páginas internas

Al inspeccionar el código de las páginas HR existentes (`HRDashboard.tsx`, `EmployeeDirectory.tsx`, etc.), estas retornan directamente su contenido `<div className="p-6 ...">` sin envolver en ningún componente de layout que oculte el sidebar — lo que significa que el sidebar es controlado por el layout padre en `App.tsx`.

Se verificará que todas las rutas `/hr/*` estén dentro del layout con sidebar. Si alguna usa `<ProtectedRoute>` sin el layout wrapper correcto, se corrige.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/dashboard/DashboardSidebar.tsx` | Reemplazar el bloque HR con la nueva estructura jerárquica de 2 niveles; cambiar label "RRHH" → "Recursos Humanos" y nombre raíz "RRHH" → "Empleados" |

Un solo archivo. Las páginas HR en sí no necesitan cambio ya que el sidebar es controlado por el layout, no por las páginas individuales.

---

### Iconos necesarios (todos de lucide-react, ya instalado)

Se importan: `Clock` (Operación Diaria), `Eye` (Seguimiento), `GraduationCap` (Desarrollo), `Wallet` (Finanzas), más los ya existentes `Users`, `UserPlus`, `UserCog`.
