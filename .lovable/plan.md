

# Plan: Mejoras Multi-Módulo

## Resumen
Correcciones y mejoras en 5 módulos: Tareas (analíticas, sidebar, docs), Eventos (mostrar pasados), Promolog (agentes), y Creators (eliminar registros admin).

---

## 1. TAREAS — Analíticas

**Problema**: Las analíticas reciben `tasks` y `getTaskStatus` como props y funcionan correctamente si hay tareas. No hay bug evidente en el código — posible que el proyecto no tenga tareas con `start_at` (necesario para Gantt) o que la tab no se renderice por falta de datos.

**Cambios en `TaskAnalyticsTab.tsx`**:
- Agregar estados explícitos de loading y empty para cada sección (pie, bars, gantt, workload)
- Si no hay datos para una sección específica, mostrar empty state descriptivo en lugar de no renderizar nada
- Agregar KPI cards resumen al inicio (total tareas, completadas, vencidas, progreso %)

## 2. TAREAS — Sidebar de proyectos

**Problema**: El `ProjectMiniSidebar` usa `as any` para las queries y filtra solo proyectos `active`. La query puede fallar silenciosamente.

**Cambios en `ProjectMiniSidebar.tsx`**:
- Agregar manejo de errores y loading state (skeleton items)
- Agregar empty state si no hay proyectos
- Mejorar el highlight del proyecto activo con una barra lateral (left border accent)
- Incluir enlace a `/tareas` para volver a la lista general
- Mostrar estado de carga con shimmer/skeleton en los items

## 3. TAREAS — Documentación de proyectos

**Problema**: La sección funciona pero tiene UX débil — sin validación de URL, sin loading states, sin feedback de errores.

**Cambios en `ProjectDocumentationTab.tsx`**:
- Agregar validación de URL (verificar que empiece con `http://` o `https://`)
- Agregar loading states (skeleton) mientras cargan links y doc
- Agregar error states si fallan las queries
- Mostrar favicon/icono por dominio si es posible (o al menos un icono genérico de link)
- Mejorar UX del formulario de edición inline de links

**Cambios en `useProjectDocumentation.ts`**:
- Agregar `onError` handlers con toast de error

## 4. EVENTOS — Mostrar eventos pasados

**Problema**: Los eventos se cargan todos (`fetchEventos` no filtra por fecha), pero la UI no separa visualmente entre próximos y pasados. Los status tabs ya incluyen "Completados".

**Cambios en `EventosContent.tsx`**:
- Agregar separación visual: sección "Próximos" y "Pasados" cuando no hay filtro de status activo
- Determinar "pasado" por `date < today` y/o `status === "completed"`
- Agregar badge o indicador visual de estado temporal (pasado/activo/próximo)

**Cambios en `EventosTable.tsx`**:
- Agregar indicador visual de evento pasado (opacidad reducida o badge "Pasado")

## 5. PROMOLOG — Agentes

**Problema**: En el tab de Agentes de `PromologContent.tsx`, los `agentsData` se construyen desde `promologEntries` que tiene `.limit(200)`. Si los últimos 200 registros son todos de Lorena, solo ella aparece.

**Cambios en `PromologContent.tsx`**:
- Para el tab de agentes, usar la RPC `get_distinct_promolog_agents` (ya existe) en lugar de depender de los 200 entries limitados
- Hacer una query separada sin limit para el cálculo de estadísticas de agentes, o usar paginación completa
- Agregar loading y empty states al listado de agentes

## 6. CREATORS — Eliminar registros (admin only)

**Problema**: No existe acción de eliminar en onboarding, offboarding ni en el listado general de creators.

### 6a. Listado de Creators (`CreadoresTable.tsx`)
- Agregar botón de eliminar (Trash2 icon) en la columna de acciones, visible solo si `isAdmin`
- Agregar modal de confirmación (`AlertDialog`) antes de eliminar
- Implementar mutación de eliminación contra tabla `creators`
- Toast de éxito/error

### 6b. Onboarding (`OnboardingContent.tsx` / `OnboardingTable.tsx`)
- Agregar acción de eliminar registro de onboarding, visible solo para admin
- Modal de confirmación
- Eliminar de tabla `creator_onboardings` o cambiar status

### 6c. Offboarding (`OffboardingListPage.tsx`)
- Agregar acción de eliminar registro de offboarding, visible solo para admin
- Modal de confirmación
- Eliminar de tabla `creator_offboardings`

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `TaskAnalyticsTab.tsx` | Empty states, KPIs, loading |
| `ProjectMiniSidebar.tsx` | Loading, error, empty states, highlight mejorado |
| `ProjectDocumentationTab.tsx` | Validación URL, loading/error states |
| `useProjectDocumentation.ts` | Error handlers |
| `EventosContent.tsx` | Separación próximos/pasados |
| `EventosTable.tsx` | Indicador visual de pasado |
| `PromologContent.tsx` | Query de agentes sin limit(200) |
| `CreadoresTable.tsx` | Botón eliminar admin + modal confirmación |
| `OnboardingTable.tsx` o `OnboardingContent.tsx` | Botón eliminar admin |
| `OffboardingListPage.tsx` | Botón eliminar admin |

No se requieren cambios de base de datos — las tablas ya existen y las operaciones DELETE están cubiertas por RLS existente.

