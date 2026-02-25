

## Plan: Estandarizar DashboardMetricCard con hover obligatorio y documentar patrones en Design System

### Problema

1. **DashboardMetricCard** acepta `hoverClass` como prop opcional, lo que permite que cada página pase hovers inconsistentes. ConfiguracionPage usa `hover:border-primary/30` (sin escala ni gradiente), mientras que ControlFinanciero y Prospectos usan el patrón completo (`hover:scale-[1.03] hover:bg-gradient-to-br ...`).

2. El **Design System** documenta el hover de KPI Cards en CardsSection como un div manual, pero no documenta el componente `DashboardMetricCard` que es el que realmente se usa en toda la app.

3. La **LayoutPatternsSection** no documenta el patrón principal de la plataforma: layout de pantalla completa con header fijo, contenido scrolleable y footer fijo (para wizards).

### Cambios

#### 1. `src/components/dashboard/DashboardMetricCard.tsx`
- Incorporar el hover estándar directamente en el componente, haciéndolo obligatorio
- Reemplazar el prop `hoverClass` por un prop semántico `color` que determine automáticamente el gradiente y borde de hover
- Colores soportados: `primary`, `accent`, `success`, `warning`, `destructive`, `muted` (default)
- Cada color aplica: `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-[color]/15 hover:to-transparent hover:border-[color]/40`
- El icono también usa el color correspondiente en lugar de `text-muted-foreground`

```text
Props actuales:           Props nuevos:
─────────────            ─────────────
label: string            label: string
value: string            value: string
icon: LucideIcon         icon: LucideIcon
subtitle?: string        subtitle?: string
valueColor?: string      color?: "primary" | "accent" | "success" | "warning" | "destructive" | "muted"
hoverClass?: string      (eliminado hoverClass)
```

#### 2. `src/pages/finanzas/configuracion/ConfiguracionPage.tsx`
- Actualizar las 5 instancias de `DashboardMetricCard` para usar el nuevo prop `color` en vez de `hoverClass`/`valueColor`

#### 3. Actualizar todas las demás páginas que usan `DashboardMetricCard`
- `ControlFinancieroPage.tsx` — 4 instancias
- `ProspectosPage.tsx` — instancias con hoverClass
- Cualquier otra página que use el componente: migrar de `hoverClass` + `valueColor` a `color`
- Búsqueda encontró 29 archivos — se actualizarán todos

#### 4. `src/pages/design-system/sections/CardsSection.tsx`
- Agregar subsección "DashboardMetricCard" después de "KPI / Metric Cards"
- Mostrar el componente real renderizado con cada variante de color (primary, accent, success, warning, destructive, muted)
- Documentar los props, el hover automático y las reglas de uso
- Reemplazar el ejemplo manual de KPI cards por el componente real

#### 5. `src/pages/design-system/sections/LayoutPatternsSection.tsx`
- Agregar nuevo patrón "Dashboard Page (Standard)" como primer patrón, documentando:
  - `h-full overflow-hidden` en el contenedor raíz
  - Header fijo: `shrink-0 bg-background border-b px-6 pt-6 pb-4`
  - Contenido scrolleable: `flex-1 overflow-auto p-6`
  - Título: `text-xl font-semibold` (sin icon box)
  - Jerarquía: Header → KPIs → Tabs → Filtros → Contenido
- Agregar patrón "Wizard / Form Page" documentando:
  - Header fijo + stepper fijo + contenido scrolleable + footer fijo
  - `h-full overflow-hidden` + `shrink-0` para header/stepper/footer
  - `flex-1 overflow-auto` para contenido
- Agregar diagrama visual ASCII para cada patrón
- Marcar como obsoleto el patrón "Centrado con max-width" para dashboards

### Resultado

- El hover de KPI es obligatorio y consistente en toda la plataforma sin depender de que cada dev pase la clase correcta
- El Design System sirve como referencia real con el componente `DashboardMetricCard` documentado
- Los patrones de layout quedan documentados para evitar errores recurrentes de header/footer scrolleando

