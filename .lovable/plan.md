

## Plan: Modal de plataformas en Completadas + verificar stats

### Contexto actual
- Ya existe la tabla `closer_platform_sales` con `creator_id`, `platform`, `product`, `price`
- Ya existe `PlatformSalesPanel` que permite agregar/eliminar ventas por plataforma (usado en tab "asignadas" como fila expandible)
- Las KPI cards ya leen `platformRevenue` desde `closer_platform_sales` y muestran Rev por plataforma individual + Rev. Plataformas total + Rev. OnlyFans
- En "Completadas", la columna "Plataforma" actualmente usa un `Select` inline que solo guarda UNA plataforma en `main_platform`

### Cambios

**1. Crear `PlatformSalesModal.tsx`** — Modal (Dialog) que se abre al hacer clic en la celda de plataforma en Completadas
- Muestra las ventas existentes del `closer_platform_sales` para ese `creator_id`
- Permite agregar múltiples plataformas con precio (reutiliza la lógica de `PlatformSalesPanel`)
- Muestra badges/chips con las plataformas vendidas y el total
- Botón "Agregar venta" con select de plataforma + input de precio + producto opcional
- Lista de ventas existentes con opción de eliminar
- Footer con total de ventas

**2. Modificar `LeadTable.tsx` — Tab Completadas**
- Reemplazar el `Select` inline de plataforma (líneas 722-730) por un botón/celda clickeable que:
  - Muestra badges de las plataformas vendidas (obtenidas de `closer_platform_sales`)
  - Al hacer clic abre el `PlatformSalesModal`
- Agregar estado `platformModalId` para controlar qué creator tiene el modal abierto
- Necesita cargar las ventas por plataforma de todos los creators en Completadas (query adicional o pasar datos desde el hook)

**3. Modificar `useCloserLeads.ts`**
- Agregar query para cargar `closer_platform_sales` agrupadas por `creator_id` cuando el tab es "completadas", para mostrar los badges en cada fila
- Retornar `platformSalesByCreator: Record<string, { platform: string; price: number }[]>`

**4. Verificar KPI cards** — Ya funcionan correctamente:
- `platformRevenue` suma precios de `closer_platform_sales` agrupados por plataforma
- `Rev. Plataformas` = suma de LeakHunter + Blu + Trafix + ORA + Piclink
- `Rev. OnlyFans` = suma de OnlyFans
- Cuando se agregan ventas desde el modal, se invalida `closer-platform-revenue` (ya lo hace `PlatformSalesPanel`)

### Detalle técnico

```text
┌─────────────────────────────────────────────┐
│  Completadas Table Row                      │
│  ... │ Plataforma          │ Acciones       │
│  ... │ [Blu] [Piclink] +2  │ ⋮              │  ← click abre modal
│  ... │ [OnlyFans]          │ ⋮              │
└─────────────────────────────────────────────┘

┌──── PlatformSalesModal ─────────────────────┐
│  Ventas por plataforma — @maria             │
│                                             │
│  Blu – Suscripción         $150    🗑       │
│  Piclink – Pack            $80     🗑       │
│                                             │
│  Total: $230                                │
│                                             │
│  [+ Agregar venta]                          │
│  ┌─ Plataforma ─┐ ┌─ Producto ─┐ ┌ Precio ┐│
│  │ Select...     │ │ Opcional   │ │ $0     ││
│  └───────────────┘ └───────────┘ └────────┘│
│                          [Cancelar] [Guardar]│
└─────────────────────────────────────────────┘
```

### Archivos
- **Crear**: `src/pages/closers/components/PlatformSalesModal.tsx`
- **Modificar**: `src/pages/closers/components/LeadTable.tsx`
- **Modificar**: `src/pages/closers/hooks/useCloserLeads.ts`

Las KPI cards no requieren cambios — ya reflejan correctamente los datos de `closer_platform_sales`.

