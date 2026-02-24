

## Mejorar espaciado y legibilidad del sidebar HR

### Problema

El modulo de Empleados tiene 3 niveles de anidacion (Empleados > Grupo > Sub-grupo > Items) que genera un sidebar visualmente amontonado y dificil de leer, como se ve en la captura.

### Solucion

Cambiar la estructura para que los grupos de HR sean items de primer nivel dentro de la seccion "Recursos Humanos", en lugar de estar todos anidados dentro de un unico collapsible "Empleados". Esto elimina un nivel de anidacion y da mas aire visual.

### Nueva estructura visual

```text
Recursos Humanos (SidebarGroupLabel)
  Dashboard HR (item directo)
  Employee Lifecycle  >  (collapsible nivel 1)
    Candidatos
    Onboarding
    Empleados Activos
    Offboarding (disabled)
  Gestion Laboral  >  (collapsible nivel 1)
    Control de Tiempo  >  (collapsible nivel 2)
      Asistencia
      Horarios y Turnos
      Horarios Chatters
      Horas Extra
      Banco de Horas
    Ausencias  >  (collapsible nivel 2)
      Vacaciones
      Permisos
      Incapacidades (disabled)
    Monitoreo (item directo)
  Seguimiento  >  (collapsible nivel 1)
    Incidentes
  Desarrollo & Performance  >  (collapsible nivel 1)
    Desempeno
    Capacitacion
  Organizacion  >  (collapsible nivel 1)
    Directorio
    Organigrama (disabled)
  Finanzas  >  (collapsible nivel 1)
    Deducciones (disabled)
```

### Cambios concretos en `DashboardSidebar.tsx`

| Cambio | Detalle |
|--------|---------|
| Eliminar wrapper "Empleados" collapsible | Los grupos HR pasan a ser items directos de SidebarMenu, cada uno como su propio Collapsible de primer nivel (igual que Creadores o Ventas) |
| Dashboard HR | Pasa de sub-item a item de primer nivel con icono LayoutDashboard |
| Cada grupo HR | Se renderiza como un Collapsible independiente con su icono y chevron, usando SidebarMenuButton (no SidebarMenuSubButton) |
| Sub-grupos (Control de Tiempo, Ausencias) | Mantienen su collapsible anidado dentro de "Gestion Laboral" pero ahora solo es nivel 2 en vez de nivel 3 |
| Padding/spacing | Los items de primer nivel usan `px-3 py-2` estandar. Los sub-items usan el padding normal de SidebarMenuSub. Se eliminan los `text-xs` en sub-grupo labels para que usen `text-sm` como el resto |
| Modo colapsado | El dropdown del sidebar colapsado lista "Dashboard HR" + todos los hrFlatItems, sin necesidad del wrapper "Empleados" |
| Grupos con un solo item | Seguimiento (solo Incidentes) y Finanzas (solo Deducciones) se renderizan como collapsible normal pero auto-cerrados por defecto si no estan activos |

### Resultado esperado

- Maximo 2 niveles de anidacion (grupo > items, o grupo > sub-grupo > items solo en Gestion Laboral)
- Cada seccion HR tiene su propio icono visible, facilitando el escaneo visual
- Mas espacio vertical entre secciones
- Texto legible con tamano uniforme `text-sm`

### Archivo modificado

Solo `src/components/dashboard/DashboardSidebar.tsx`

