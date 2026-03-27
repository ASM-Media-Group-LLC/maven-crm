

## Plan: Limpiar lógica de revenue en KPI Cards

### Problema actual

1. **Card individual "OnlyFans"** muestra `platformRevenue["OnlyFans"]` (ventas de `closer_platform_sales`). Pero OnlyFans ya no es una plataforma de venta — su revenue se trackea via `estimated_monetization`. Esta card es redundante y confusa.

2. **"Rev. Plataformas"** suma TODO lo que hay en `platformRevenue` (incluyendo posibles entradas legacy de OnlyFans en `closer_platform_sales`), lo cual contaminaría el total de plataformas.

### Cambios

**Archivo: `src/pages/closers/components/ClosersKPICards.tsx`**

1. **Eliminar la card individual "OnlyFans"** de la fila de revenue — ya no aplica como venta de plataforma.

2. **Filtrar OnlyFans del cálculo de `revPlataformas`**: En vez de sumar todo `Object.values(platformRevenue)`, sumar solo las plataformas válidas (Trafix, Blu, Piclink, LeakHunter, ORA):
```ts
const salePlatforms = ["Trafix", "Blu", "Piclink", "LeakHunter", "ORA"];
const revPlataformas = salePlatforms.reduce((s, p) => s + (platformRevenue[p] || 0), 0);
```

3. **Revenue cards resultantes** (6 cards individuales + 3 highlight):
```
[LeakHunter] [Blu] [Trafix] [ORA] [Piclink] | [Rev. Plat.] [Rev. OF] [Rev. Total]
```

Grid pasa de `md:grid-cols-9` a `md:grid-cols-8`.

### Archivo
- **Modificar**: `src/pages/closers/components/ClosersKPICards.tsx`

