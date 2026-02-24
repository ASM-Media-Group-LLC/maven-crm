

## Reestructurar navegacion del modulo Empleados (RRHH)

### Objetivo

Reorganizar los grupos del sidebar de RRHH segun la nueva jerarquia, manteniendo Finanzas y agregando Incapacidades dentro de Ausencias.

### Nueva estructura

```text
Empleados (RRHH)
+-- Dashboard HR
+-- Employee Lifecycle
|   +-- Candidatos
|   +-- Onboarding
|   +-- Empleados Activos (/hr/directorio)
|   +-- Offboarding (deshabilitado)
+-- Gestion Laboral
|   +-- Control de Tiempo
|   |   +-- Asistencia
|   |   +-- Horarios y Turnos
|   |   +-- Horarios Chatters
|   |   +-- Horas Extra (/hr/horarios/horas-extras)
|   |   +-- Banco de Horas (/hr/horarios/banco-horas)
|   +-- Ausencias
|   |   +-- Vacaciones
|   |   +-- Permisos
|   |   +-- Incapacidades (deshabilitado - nuevo)
|   +-- Monitoreo
+-- Seguimiento
|   +-- Incidentes
+-- Desarrollo & Performance
|   +-- Desempeno
|   +-- Capacitacion
+-- Organizacion
|   +-- Directorio
|   +-- Organigrama (deshabilitado)
+-- Finanzas
    +-- Deducciones (deshabilitado)
```

### Cambios

Solo se modifica **`src/components/dashboard/DashboardSidebar.tsx`**:

| Cambio | Detalle |
|--------|---------|
| Reemplazar array `hrGroups` | Definir los 6 nuevos grupos con la estructura descrita |
| "Employee Lifecycle" (icono `UserCheck`) | Candidatos, Onboarding, Empleados Activos (`/hr/directorio`), Offboarding (null) |
| "Gestion Laboral" (icono `Clock`) | Contiene 3 sub-secciones. **Control de Tiempo**: Asistencia, Horarios y Turnos, Horarios Chatters, Horas Extra, Banco de Horas. **Ausencias**: Vacaciones, Permisos, Incapacidades (null). **Monitoreo** como item directo |
| Sub-subgrupos anidados | "Control de Tiempo" y "Ausencias" se renderizan como `Collapsible` adicionales dentro de "Gestion Laboral", con el mismo patron visual existente |
| "Seguimiento" (icono `Eye`) | Solo Incidentes (Monitoreo se mueve a Gestion Laboral) |
| "Desarrollo & Performance" (icono `GraduationCap`) | Desempeno + Capacitacion |
| "Organizacion" (icono `Users`) | Directorio + Organigrama (null) |
| "Finanzas" (icono `Wallet`) | Se mantiene con Deducciones (null) |
| Dropdown colapsado | Se actualiza `hrFlatItems` para reflejar la nueva lista plana |

### Detalle tecnico

Se introduce un tipo `subGroups` opcional en la estructura de datos de `hrGroups` para soportar los sub-subgrupos de "Gestion Laboral". La renderizacion detecta si un grupo tiene `subGroups` y renderiza `Collapsible` anidados adicionales; si no, renderiza items directos como hasta ahora.

No se crean nuevas paginas, rutas ni dependencias. Solo reestructuracion del sidebar.

