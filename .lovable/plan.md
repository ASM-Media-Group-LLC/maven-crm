

## Plan: Mejorar búsqueda en Closers para aceptar URLs

### Problema
La búsqueda en línea 336 de `useCloserLeads.ts` solo compara el texto ingresado contra `instagram_handle`. Si el usuario pega un link completo como `https://www.instagram.com/esmeralda_arang0/`, no encuentra nada porque el handle almacenado es solo `esmeralda_arang0`.

### Solución
Usar `normalizeHandle` (ya existe en `src/lib/handle-utils.ts`) para normalizar el término de búsqueda antes de comparar. Así, tanto `esmeralda_arang0` como `https://www.instagram.com/esmeralda_arang0/` encontrarán el mismo resultado.

### Cambio

**Archivo: `src/pages/closers/hooks/useCloserLeads.ts`**

1. Importar `normalizeHandle` desde `@/lib/handle-utils`
2. En el filtro de búsqueda (línea 336), normalizar el `search` antes de comparar:

```ts
if (search) {
  const normalizedSearch = normalizeHandle(search);
  const handle = c.instagram_handle.toLowerCase();
  if (!handle.includes(normalizedSearch) && !handle.includes(search.toLowerCase())) return false;
}
```

Esto hace doble check: primero intenta con el handle normalizado (para URLs), luego con el texto raw (para búsquedas parciales normales).

### Archivo
- **Modificar**: `src/pages/closers/hooks/useCloserLeads.ts`

