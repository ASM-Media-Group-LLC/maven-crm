

## Diagnóstico: El lead de Marielby no aparece

### Causa raíz

El lead **sí existe** en la base de datos (`entry_date: 2026-03-10`, `lg_user_id` correcto). El problema es un **bug de cache**: después de crear un lead, `AddLeadModal.tsx` (línea 172) invalida el query key `["leadgen-entries"]`, pero la página principal usa `useLeadGenByDateRange` que tiene el query key `["leadgen-entries-range", ...]`. Al no invalidar el cache correcto, el lead recién creado no aparece hasta que se recargue la página manualmente o expire el staleTime (2 min).

### Cambio

**`src/pages/leadgen/AddLeadModal.tsx`** — Agregar invalidación del query key correcto:

```typescript
// Línea 172 - agregar:
queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
```

Esto asegura que al cerrar el modal de creación, la tabla se refresque inmediatamente mostrando el lead recién creado.

Es un cambio de una línea.

