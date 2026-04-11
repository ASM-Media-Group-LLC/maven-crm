

# Plan: Correcciones UX/UI Multi-Módulo

## 1. Analíticas Generales de Proyectos (no muestran datos)

**Problema**: `GlobalAnalyticsTab` recibe `allTasks` desde `useProjects()`. Si `allTasks` está vacío o no se carga correctamente, no se muestra nada. Necesito verificar `useProjects` para entender cómo se obtiene `allTasks`.

**Cambios en `ProjectsListContent.tsx`**:
- Agregar estado de loading mientras `allTasks` carga
- Pasar `isLoading` a `GlobalAnalyticsTab`

**Cambios en `GlobalAnalyticsTab.tsx`**:
- Agregar KPI cards resumen al inicio (Total tareas, Completadas, Vencidas, Progreso %)
- Agregar loading state (skeletons)
- Agregar empty state más descriptivo
- Verificar que `allTasks` realmente contenga datos (debug query en `useProjects`)

**Investigar `useProjects.ts`**: Revisar cómo se obtiene `allTasks` — puede haber un problema de paginación o de query que limite los resultados.

## 2. Docs — Layout no se adapta al ancho

**Problema**: `ProjectDocumentationTab` tiene `max-w-4xl mx-auto` que limita el ancho artificialmente.

**Cambio en `ProjectDocumentationTab.tsx`**:
- Remover `max-w-4xl mx-auto` del wrapper principal, dejando que ocupe el ancho completo del contenedor padre (como hacen las otras tabs: Lista, Kanban, Analíticas)

## 3. Eventos — Revertir separación Próximos/Pasados

**Problema**: El usuario no quiere la separación visual en `/eventos`. Los eventos deben mostrarse como antes (lista unificada). Pero al compartir la agenda, debe mostrar todos los eventos (pasados + próximos).

**Cambios en `EventosContent.tsx`**:
- Eliminar la lógica de separación Próximos/Pasados (líneas 179-223)
- Volver al render simple: mostrar `events` directamente sin secciones

**Cambios en `SharedAgendaPage.tsx`**:
- Actualmente solo muestra `upcomingEvents` (filtra `date >= today`)
- Agregar toggle o tab para ver "Todos" vs "Próximos" vs "Pasados"
- O mostrar todos por defecto, agrupados por fecha, incluyendo pasados

## 4. Creadores — Mover eliminar al perfil/detalle

**Cambios en `CreadoresTable.tsx`**:
- Remover el botón de eliminar (Trash2) de la columna de acciones
- Remover la mutación `deleteCreator` y el `AlertDialog` de confirmación de este archivo

**Cambios en `ViewCreadorModal.tsx`**:
- Agregar botón de eliminar (solo visible para admin) en el footer/header del modal de detalle
- Agregar `AlertDialog` de confirmación
- Implementar mutación de eliminación

## 5. Closers — Columna Categoría en Completadas

**Problema**: En la pestaña "Completadas" de `/closers` no hay columna de categoría con selector inline.

**Cambios en `LeadTable.tsx`**:
- En el header de "completadas" (línea 570-584): agregar columna "Categoría" después de "Instagram"
- En el row de "completadas" (línea 805-870): agregar celda con `Select` inline para categoría con opciones: Elite, A+, A, B+, B
- El `onFieldChange` ya existe y soporta actualizar `category`

La columna `category` ya existe en `closer_creators`, no se necesita migración.

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `GlobalAnalyticsTab.tsx` | KPIs, loading/empty states, debug data |
| `ProjectsListContent.tsx` | Pasar isLoading a analytics |
| `useProjects.ts` | Investigar/fix allTasks query |
| `ProjectDocumentationTab.tsx` | Remover max-w-4xl mx-auto |
| `EventosContent.tsx` | Revertir separación próximos/pasados |
| `SharedAgendaPage.tsx` | Mostrar todos los eventos (pasados + próximos) |
| `CreadoresTable.tsx` | Remover botón eliminar de acciones |
| `ViewCreadorModal.tsx` | Agregar eliminar en detalle (admin only) |
| `LeadTable.tsx` | Agregar columna categoría inline en completadas |

No se requieren migraciones de base de datos.

