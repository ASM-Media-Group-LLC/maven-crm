

## Plan: Agregar efecto hover/select a las Operational Cards

Actualmente las cards solo tienen `hover:scale-[1.03] hover:shadow-lg`. Para comunicar mejor que son clickeables y llevan a otra pantalla, aplicaremos el mismo patrón visual del `DashboardMetricCard` estandarizado: gradiente de fondo + borde semántico en hover, más una flecha indicadora.

### Cambio en `src/pages/sales-overview/SalesOperationalCards.tsx`

1. Importar `ChevronRight` de lucide-react
2. Agregar a cada card una propiedad `color` con un token semántico (primary, accent, warning, etc.)
3. Reemplazar el hover genérico del `<Card>` por el patrón estandarizado: `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-{color}/15 hover:to-transparent hover:border-{color}/40`
4. Agregar un pequeño `<ChevronRight>` en el header de cada card para indicar visualmente la navegación

### Asignación de colores por card:
- **Comparativas** → `primary`
- **Top 10** → `accent`
- **Bajando** → `warning`
- **Alto Potencial** → `accent`
- **Alertas** → `warning`

### Resultado
Cada card mostrará un gradiente de color y borde al hacer hover, consistente con las KPI cards de arriba, más una flecha que señala que es navegable.

