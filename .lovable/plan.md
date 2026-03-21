

## Plan: Estandarizar comportamiento de TODAS las tablas de la plataforma

### Diagnóstico actual

Hay **72 archivos** con tablas en la plataforma. Se dividen en dos categorías:

**Tablas de alto volumen (necesitan paginación + scroll + sticky):**
- LeadGen, Closers, Contactos — ya tienen paginación server-side pero layout roto
- Creadores — descarga todo sin paginación
- Promolog — `.limit(200)` sin paginación real
- HR Applicants, HR Performance, HR Offboarding, HR Schedules — sin paginación
- Finanzas Comisiones, Collections — sin paginación
- Sales Performance (EarningsTable) — ya tiene paginación

**Tablas pequeñas (config, detalle, auditoría):**
- Finanzas Configuración, Horas, Announcements detail — pocas filas, no necesitan paginación

### Componente reutilizable: `DataTableShell`

Crear un wrapper compartido que encapsule el patrón correcto de una sola vez. Esto evita repetir la misma estructura en cada módulo y garantiza consistencia.

**Archivo:** `src/components/ui/data-table-shell.tsx`

Responsabilidades:
- Contenedor `flex flex-col` con altura controlada
- Área de scroll interna (`overflow-auto`) donde vive la `<Table>`
- Footer fijo (`shrink-0`) con: contador "Mostrando X–Y de Z registros" + paginador + selector de filas por página (10/25/50)
- Props: `currentPage`, `totalPages`, `totalCount`, `pageSize`, `onPageChange`, `onPageSizeChange`, `children` (la tabla)

El componente se encarga de:
1. Scroll vertical interno con altura máxima relativa al viewport
2. Scroll horizontal con scrollbar visible (`overflow-x-auto`)
3. Footer siempre visible fuera del scroll
4. Contador de resultados alineado a la izquierda, paginador a la derecha

### Cambios por módulo

#### 1. LeadGen (`LeadGenContent.tsx`, `LeadGenTable.tsx`)
- Envolver `LeadGenTable` en `DataTableShell` con las props de paginación existentes
- Eliminar el div `shrink-0 pt-3` manual que tiene el `EarningsPagination`
- La tabla ya tiene sticky headers correctos — solo reorganizar el contenedor

#### 2. Closers (`ClosersContent.tsx`, `LeadTable.tsx`)
- Envolver `CloserTable` en `DataTableShell`
- Eliminar el bloque manual de paginación (líneas 221-236 de ClosersContent)
- La tabla ya tiene sticky headers correctos

#### 3. Contactos (`ContactosContent.tsx`, `ContactosTable.tsx`)
- Envolver `ContactosTable` en `DataTableShell`
- Eliminar el bloque manual de paginación (líneas 302-307)
- La tabla ya tiene sticky headers correctos

#### 4. Creadores (`useCreadores.ts`, `CreadoresContent.tsx`, `CreadoresTable.tsx`)
- Agregar paginación server-side a `useCreadores`: aceptar `page` y `pageSize`, usar `.range()` + `{ count: "exact" }`
- Devolver `{ creators, total, totalPages }` desde el hook
- Agregar estado `page`/`pageSize` en `CreadoresContent`
- Envolver `CreadoresTable` en `DataTableShell`
- La tabla ya tiene sticky headers correctos

#### 5. Promolog (`PromologContent.tsx`, `PromologTable.tsx`)
- Reemplazar `.limit(200)` por paginación server-side con `.range()` + `{ count: "exact" }`
- Agregar estado `page`/`pageSize` en `PromologContent`
- Envolver `PromologTable` en `DataTableShell`
- La tabla ya tiene sticky headers correctos

#### 6. HR Applicants (`HRApplicants.tsx`)
- Ya tiene `max-h-[calc(100vh-28rem)]` y sticky on `TableRow` (incorrecto — debe ser por celda)
- Cambiar sticky de `TableRow` a cada `TableHead`
- Agregar paginación client-side (paginar `filtered` array)
- Envolver en `DataTableShell`

#### 7. HR Performance (`HRPerformance.tsx`)
- Misma corrección: sticky por celda + `DataTableShell` con paginación client-side

#### 8. HR Offboarding (`HROffboarding.tsx`)
- Misma corrección

#### 9. HR Schedules + Chatter Schedules (`HRSchedules.tsx`, `HRChatterSchedules.tsx`)
- Misma corrección

#### 10. Finanzas Comisiones (`ComisionesPage.tsx`)
- Agregar paginación client-side + `DataTableShell`

#### 11. Finanzas Collections (`CollectionsPage.tsx`)
- Agregar paginación client-side + `DataTableShell`

#### 12. Sales Performance EarningsTable
- Ya tiene paginación — solo envolver en `DataTableShell` para consistencia visual

### Tablas pequeñas (NO tocar paginación)
- `AuditoriaUsersTable`, `ConfiguracionPage`, `HorasPage`, `AnnouncementDetailModal`
- Solo corregir sticky headers si aplica (por celda, no por row)
- No agregar paginación — son tablas de pocas filas

### Especificaciones del `DataTableShell`

```text
┌──────────────────────────────────────────────┐
│  overflow-auto (vertical + horizontal)       │
│  ┌──────────────────────────────────────────┐│
│  │ Table (min-width para scroll horizontal) ││
│  │  thead → sticky top-0 z-20 bg-card      ││
│  │  tbody → datos paginados                 ││
│  └──────────────────────────────────────────┘│
├──────────────────────────────────────────────┤
│  shrink-0 border-t px-4 py-3 bg-background  │
│  ┌─────────────────┐  ┌───────────────────┐ │
│  │ Mostrando 1-10  │  │ < 1 2 3 ... 10 > │ │
│  │ de 124 registros│  │ 10 | 25 | 50     │ │
│  └─────────────────┘  └───────────────────┘ │
└──────────────────────────────────────────────┘
```

### Archivos a crear
- `src/components/ui/data-table-shell.tsx`

### Archivos a modificar
- `src/pages/leadgen/LeadGenContent.tsx`
- `src/pages/closers/ClosersContent.tsx`
- `src/pages/contactos/ContactosContent.tsx`
- `src/pages/creadores/useCreadores.ts`
- `src/pages/creadores/CreadoresContent.tsx`
- `src/pages/promolog/PromologContent.tsx`
- `src/pages/hr/HRApplicants.tsx`
- `src/pages/hr/HRPerformance.tsx`
- `src/pages/hr/HROffboarding.tsx`
- `src/pages/hr/HRSchedules.tsx`
- `src/pages/hr/HRChatterSchedules.tsx`
- `src/pages/finanzas/comisiones/ComisionesPage.tsx`
- `src/pages/finanzas/collections/CollectionsPage.tsx`
- `src/pages/sales-performance/EarningsTable.tsx` (o su parent)

### Resultado
- Todas las tablas con >10 registros tienen paginador visible con contador + selector de pageSize
- El paginador nunca se corta ni se monta encima de la tabla
- Headers sticky reales en todas las tablas
- Scroll horizontal con barra visible en desktop
- Un solo componente `DataTableShell` controla el patrón — sin variaciones

