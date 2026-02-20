
## Dos mejoras: Sidebar HR compacto + Dashboard de Recursos Humanos rediseñado

### Problema 1: Submenú HR con títulos en dos líneas

Los labels de los grupos anidados en el sidebar de RRHH son demasiado largos para caber en una línea en el espacio disponible:
- "Seguimiento y Control" → **"Seguimiento"**
- "Finanzas Operativas" → **"Finanzas"**
- "Operación Diaria" → **"Operaciones"**
- "Reclutamiento" → queda bien
- "Desarrollo" → queda bien
- "Información" → queda bien

Además, añadir un enlace directo al Dashboard de HR (`/hr`) como primer sub-item de la sección, antes de los grupos colapsables, para que el usuario pueda navegar directamente al dashboard.

**Archivo:** `src/components/dashboard/DashboardSidebar.tsx`

Cambios en el array `hrGroups`:
```
"Operación Diaria"      → "Operaciones"
"Seguimiento y Control" → "Seguimiento"
"Finanzas Operativas"   → "Finanzas"
```

También añadir un item directo "Dashboard" (con `LayoutDashboard` icon) apuntando a `/hr` antes de los grupos expandibles.

---

### Problema 2: Rediseño del HR Dashboard

El `HRDashboard.tsx` actual solo tiene 4 KPI cards básicas + distribución por departamento + contrataciones recientes.

La referencia visual muestra:

**Sección 1 - KPI Cards superiores** (4 tarjetas):
- Total Empleados, Check-ins Hoy (= 0 placeholder), Ausencias Pendientes (pendientes de revisión), En Onboarding (nuevos en 30d)

**Sección 2 - Rotación y Retención** (card contenedor con 5 mini-cards):
- Rotación 30d (%), Retiros 30d (#), % Ingresos 30d, Antigüedad Promedio, Rotación 12m
- Cada mini-card tiene fondo de color sutil (rojo oscuro, naranja oscuro, verde oscuro, azul oscuro, púrpura oscuro)

**Sección 3 - Acciones Rápidas** (4 botones horizontales):
- Registrar Ausencia → `/hr/ausencias`
- Ver Asistencia → (placeholder)
- Ver Directorio → `/hr/directorio`
- Agregar Empleado → `/hr/empleado/nuevo`

**Sección 4 - Dos columnas**:
- **Solicitudes Pendientes** (lado izquierdo): Lista de ausencias con estado `pendiente`, usando datos de la tabla `absences`. Botón "Ver todas →"
- **Módulos HR** (lado derecho): Grid 2x3 de tarjetas de navegación (Asistencia, Vacaciones, Horarios, Capacitación, Incidentes, Candidatos) + botón "Exportar Arquitectura"

**Sección 5 - Resumen del Equipo** (4 mini-cards con fondo de color):
- Activos, En Licencia, Nuevos (30d), Total

---

### Datos requeridos

Para las métricas de rotación se calculan desde los datos ya disponibles:
- `employees` (hook `useEmployees`)
- `absences` (query directa a Supabase para las pendientes)
- Métricas calculadas en el componente (no requieren tablas nuevas)

Para "Ausencias pendientes" se necesita una query a la tabla `absences` con `status = 'pending'`. Se puede hacer con un hook inline en el mismo componente.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/dashboard/DashboardSidebar.tsx` | Acortar labels HR, añadir link directo a Dashboard HR |
| `src/pages/hr/HRDashboard.tsx` | Rediseño completo siguiendo la referencia visual |
