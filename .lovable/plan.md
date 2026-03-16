

## Diagnóstico: Por qué se siente pesado el sistema

Identifiqué varios problemas de rendimiento:

### Problemas encontrados

1. **8 queries separadas para contar status (KPIs)**: El hook hace 8 llamadas HEAD individuales a Supabase para contar cada estado. Esto genera 8 requests de red en paralelo cada vez que se carga la pagina.

2. **500 filas renderizando Select components**: La tabla carga hasta 500 leads y cada fila renderiza 3 `Select` (Radix UI) con su `SelectContent` y `SelectTrigger`. Esto significa ~1500 componentes Select montados simultáneamente, cada uno con portales y listeners del DOM. Es extremadamente pesado.

3. **Invalidación agresiva**: Cada cambio de campo o estado invalida TODAS las queries (`closer-leads` + `closer-leads-counts`), refetcheando los 500 leads y los 8 counts de nuevo.

4. **No hay virtualización**: Las 500 filas se renderizan todas en el DOM simultáneamente.

### Plan de optimización

**1. Reemplazar Selects inline con click-to-edit (LeadTable.tsx)**
- En lugar de montar 1500 componentes Select permanentemente, mostrar Badges estáticos que al hacer click abren un `Popover` con opciones. Solo 1 popover abierto a la vez.
- Esto reduce de ~1500 componentes Radix a ~500 badges estáticos + 1 popover activo.

**2. Consolidar queries de conteo (useCloserLeads.ts)**
- Reemplazar las 8 llamadas HEAD por una sola query RPC o un `.select("status")` agrupado para obtener todos los counts en una sola llamada.

**3. Actualización optimista (useCloserLeads.ts)**
- En las mutations, actualizar el cache local inmediatamente (`queryClient.setQueryData`) sin esperar el refetch. Eliminar la invalidación de la query principal (solo invalidar counts).

**4. Reducir el límite de carga inicial**
- Bajar de 500 a 100 leads por defecto con paginación "cargar más" o scroll infinito.

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — Click-to-edit en lugar de Select permanente
- `src/pages/closers/hooks/useCloserLeads.ts` — Consolidar counts, updates optimistas, reducir limit

