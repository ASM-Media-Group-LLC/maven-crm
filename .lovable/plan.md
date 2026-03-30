

## Plan: Agregar ordenamiento por columnas en Closers + verificar sincronización Contactos → Closers

### Parte 1: Ordenamiento por columnas en LeadTable (Closers)

**Problema**: Los encabezados de las tablas en `/closers` son texto plano sin capacidad de ordenamiento. En `/contactos` cada columna tiene un botón `SortHeader` con icono `ArrowUpDown` que permite ordenar ascendente/descendente.

**Solución**: Agregar el mismo patrón de ordenamiento que usa `ContactosTable` a `LeadTable.tsx`.

**Cambios en `src/pages/closers/components/LeadTable.tsx`**:

1. Agregar estado de sorting: `sortKey` y `sortAsc` al componente `CloserTable`
2. Crear componente `SortHeader` igual al de ContactosTable (botón ghost con `ArrowUpDown`)
3. Reemplazar los `TableHead` planos por `SortHeader` en los headers de cada pestaña (todas, nuevo, asignadas, confirmadas, completadas, no_interesadas)
4. Ordenar `creators` con `useMemo` según `sortKey`/`sortAsc` antes de renderizar
5. Columnas ordenables: Creación, Instagram, Estado, Cuenta origen, Categoría, Agente, Teléfono, Monetización, Comisión

### Parte 2: Verificar sincronización Contactos → Closers

Revisar con una consulta a la BD que:
- Los contactos con teléfono en `closers_contacts` tengan su correspondiente registro en `closer_creators` via `source_contact_id`
- No existan duplicados (mismo handle apareciendo más de una vez)
- Los datos (handle, phone, category) estén sincronizados entre ambas tablas

Esto se hace vía consulta SQL de verificación. Si hay inconsistencias, se corrigen con una migración de datos.

### Archivos a modificar
- `src/pages/closers/components/LeadTable.tsx` — agregar sorting a todas las pestañas

