

## Plan: Ajustar grid de SalesOperationalCards al ancho completo

Las KPI cards usan `lg:grid-cols-5` para 5 cards. Las operational cards son 5 pero usan `lg:grid-cols-6`, dejando una columna vacía y sin ocupar todo el ancho.

### Cambio en `src/pages/sales-overview/SalesOperationalCards.tsx` (línea 100)

Cambiar el grid de `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` a `grid-cols-2 md:grid-cols-3 lg:grid-cols-5` para que las 5 cards se distribuyan equitativamente en todo el ancho del contenedor, igual que las KPI cards de arriba.

