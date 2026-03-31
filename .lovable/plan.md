

## Plan: Fix visibilidad de Closers + Auditoría CSV vs DB

### Hallazgos

**1. Bug del Closer (0 creadores visibles)**

El problema NO es de RLS (la política SELECT permite `true` para autenticados). El problema está en **CreadoresContent.tsx línea 39-41** que filtra:
```tsx
return rawCreators.filter(c => c.closer_responsible_id === user.id || c.created_by === user.id);
```
Como `created_by` es NULL en todos los registros y el closer de prueba (Marielby Testing) no está asignado como `closer_responsible_id` en ningún creator, ve 0 resultados.

**Solución**: Eliminar el filtro de ownership para closers. El acceso otorgado es "ver la lista completa", no solo sus propios registros. La restricción está en las **acciones** (no editar, no dar de baja), no en la visibilidad de la lista.

**2. Auditoría CSV vs DB**

| Métrica | Valor |
|---------|-------|
| Registros en DB | 285 |
| Registros en CSV | 281 |
| Registros de prueba/test en DB | 9 (`@Testing102`, `@Testing103`, `@Testing2000`, `Testing101`, `Testing Offboarding`, `Test Creator Prueba`, `Johanna Prueba`, `joha`, `Carolina `) |
| Registros reales en DB | 276 |

El CSV tiene 281 filas pero incluye los duplicados como las dos "Agatha Gomez Casiano" (IDs distintos). La diferencia de 4 entre CSV (281) y DB (285) son las cuentas de testing/prueba que no estaban en el CSV más algunos registros añadidos después de la exportación.

No hay creadoras faltantes significativas — los datos del CSV coinciden con la DB.

---

### Cambios a implementar

**Archivo: `src/pages/creadores/CreadoresContent.tsx`**

Eliminar los filtros de ownership del closer (líneas 38-50). El closer verá la misma lista que cualquier otro rol, pero sin botones de editar/dar de baja (eso ya está implementado en CreadoresTable):

```tsx
// Eliminar estos bloques:
const creators = useMemo(() => {
  if (!isCloser || !user?.id) return rawCreators;
  return rawCreators.filter(c => c.closer_responsible_id === user.id || c.created_by === user.id);
}, [rawCreators, isCloser, user?.id]);

// Reemplazar con uso directo de rawCreators
```

También eliminar `closerStatusCounts` y los cálculos derivados del filtro de ownership, simplificando a usar directamente los datos sin filtrar.

