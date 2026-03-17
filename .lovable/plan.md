

## Diagnóstico: "Pendiente LG" y edición bloqueada

Las filas con estado "Pendiente LG" vienen de la tabla `leadgen_entries` (leads interesados que aún no se han convertido). **No existen en `closer_creators`**, por lo tanto:

1. `InlineStageSelect` tiene `disabled={!isCloser}` (línea 716) — correcto, porque `updateStage` hace `UPDATE closer_creators` y fallaría en filas que no existen ahí
2. `assignCreator` también hace solo `UPDATE closer_creators` — tampoco funcionaría para filas leadgen
3. No hay lógica de **conversión** (INSERT en `closer_creators` desde `leadgen_entries`)

El flujo correcto debería ser: al cambiar el estado o asignar un lead "Pendiente LG", primero se debe **crear** el registro en `closer_creators` (conversión) y luego aplicar el cambio.

## Plan

### 1. Crear función de conversión en `useCloserLeads.ts`

Nueva mutación `convertAndUpdate` que:
- Recibe `{ leadgenEntryId, stage?, assigned_to? }`
- Hace INSERT en `closer_creators` copiando los datos de la fila leadgen (handle, category, source_account, phone, notes, onlyfans_url, platform) y estableciendo `leadgen_entry_id` para el vínculo
- Aplica el `stage` y/o `assigned_to` indicados
- Invalida queries para refrescar la lista

### 2. Actualizar `onStageChange` en `LeadTable.tsx`

- Quitar `disabled={!isCloser}` del `InlineStageSelect` en el tab "todas" (línea 716)
- En el handler `onStageChange`, detectar si `c._source === "leadgen"`: si es así, llamar a la función de conversión en vez de `updateStage`

### 3. Actualizar `onAssign` para filas leadgen

- En `ClosersContent.tsx`, cuando se asigna una fila leadgen, usar la misma función de conversión pasando `assigned_to` y stage `"Asignada"`

### 4. Excluir "Pendiente LG" del selector de estados

- En `InlineStageSelect`, quitar `"Pendiente LG"` de la lista de opciones seleccionables — es un estado virtual que solo indica "aún no convertido", no debería poder seleccionarse manualmente

### Archivos a modificar
- `src/pages/closers/hooks/useCloserLeads.ts` — nueva mutación `convertLeadgenEntry`
- `src/pages/closers/components/LeadTable.tsx` — habilitar selector de estado para todas las filas, manejar conversión
- `src/pages/closers/ClosersContent.tsx` — manejar asignación de filas leadgen con conversión

