

## Diagnóstico: Salto al cambiar de tab en Closers

El "salto" ocurre porque cada cambio de tab dispara una nueva query a Supabase (el `activeTab` está en el `queryKey`). Mientras la nueva data se carga, la tabla se desmonta momentáneamente (el contenido anterior desaparece y aparece el nuevo). Esto causa un flash visual.

### Solución

**Archivo:** `src/pages/closers/hooks/useCloserLeads.ts`

Agregar `placeholderData: keepPreviousData` (de TanStack Query) a la query de leads. Esto mantiene la data anterior visible mientras la nueva se carga, eliminando el salto.

```typescript
import { keepPreviousData } from "@tanstack/react-query";

const { data: leads = [], isLoading } = useQuery({
  queryKey: [...],
  queryFn: async () => { ... },
  placeholderData: keepPreviousData,  // ← agregar esto
});
```

Cambio mínimo de 1 línea + 1 import. No requiere modificar ningún otro archivo.

