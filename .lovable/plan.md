

## Aplicar animacion hover en KPI cards del Dashboard y Tareas + corregir titulo

### Problemas detectados

1. **Dashboard** (`DashboardMetricCard.tsx`): Las cards KPI superiores no tienen el efecto hover con escala y gradiente que si tienen Creadores, Contactos, Sales Overview, etc.
2. **Tareas** (`ProjectsListContent.tsx`): Las 3 KPI cards tampoco tienen la animacion hover.
3. **Tareas** (`ProjectsListContent.tsx`): El titulo del header dice "Proyectos" en lugar de "Tareas".

### Patron de animacion a aplicar

El efecto estandar usado en el resto de la plataforma es:

```text
transition-all duration-200 hover:scale-[1.03] hover:bg-gradient-to-br hover:from-{color}/15 hover:to-transparent hover:border-{color}/40
```

Cada card tiene un color semantico asociado (primary, success, warning, destructive, accent) que determina el gradiente del hover.

### Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardMetricCard.tsx` | Agregar prop `hoverClass` y aplicarla al `<Card>` con `transition-all duration-200 cursor-default` |
| `src/components/dashboard/DashboardContent.tsx` | Agregar `hoverClass` a cada KPI con el color correspondiente (primary, warning, success, accent, destructive) |
| `src/pages/tareas/ProjectsListContent.tsx` | (1) Cambiar titulo "Proyectos" a "Tareas" y subtitulo a "Gestion de tareas y proyectos". (2) Agregar `hoverClass` a cada KPI card y aplicar el efecto hover con `transition-all duration-200` |

### Detalle tecnico

**DashboardMetricCard.tsx**: Agregar prop opcional `hoverClass?: string` a la interfaz. En el `<Card>`, aplicar `className={cn("transition-all duration-200", hoverClass)}`.

**DashboardContent.tsx**: Mapear colores a cada KPI:
- Total Creators: primary
- Active Tickets: warning
- Compliance: success
- New Leads: accent
- Deals: destructive (o primary segun corresponda)

**ProjectsListContent.tsx**: En el array `kpis`, agregar `hoverClass` a cada item:
- Total Proyectos: primary
- Proyectos Activos: primary
- Tareas Pendientes: warning

Y en el render, aplicar `className={cn("transition-all duration-200", kpi.hoverClass)}` al `<Card>`.
