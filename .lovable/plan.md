

## Mover cards de resumen arriba de los filtros en Promolog

### Problema

Actualmente las 4 KPI cards (Total Modelos, Tickets ingresados, NO Chequeadas, Completadas Hoy) y la seccion "Promociones por Red Social y Plataforma" estan dentro del tab Dashboard, debajo de los filtros y buscador. Segun el patron de Eventos (donde el calendario aparece antes de los tabs/filtros), estas cards deben estar arriba, antes de los tabs y filtros.

### Cambio

**Archivo**: `src/pages/promolog/PromologContent.tsx`

1. **Mover las 4 KPI cards** (lineas 440-489) fuera del bloque `activeTab === "dashboard"` y colocarlas justo despues del inicio del area scrollable (`flex-1 overflow-auto p-6 space-y-6`), antes de los tabs.

2. **Mover la seccion "Promociones por Red Social y Plataforma"** (lineas 492-532) tambien arriba, justo despues de las KPI cards y antes de los tabs.

3. **Dentro del tab Dashboard**, solo quedara la seccion "Entradas Recientes" (lineas 536-547) que muestra la tabla/grid.

### Estructura resultante

```text
[HEADER]
----
[4 KPI Cards]                          <-- siempre visibles
[Red Social cards] [Plataforma cards]  <-- siempre visibles
[Tab bar: Dashboard | Agentes | Campanas]
[Filtros: Buscar | Estado | Red | Categoria | Fechas | Vista]
42 entradas
[Tabla/Grid segun tab activo]
```

### Detalle tecnico

- Las KPI cards y social/platform cards se mostraran en todas las tabs (dashboard, agentes, campanas), igual que el calendario en Eventos se muestra siempre
- No hay cambios de logica ni de estilo, solo reordenamiento de bloques dentro del JSX
- Se elimina el wrapper `activeTab === "dashboard"` de las cards, dejando solo el contenido de entradas dentro de ese condicional

