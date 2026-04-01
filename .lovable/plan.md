

## Plan: Fix selector de agentes en Rendimiento + Consistencia de banner

### Hallazgos de datos

Al consultar la base de datos directamente:

| Agente | ID en profiles | Entries asignadas | 
|--------|---------------|-------------------|
| Lorena | `bf9c58cc` | 57 |
| Fabiana | `dd959846` | 8 (5 + 3) |
| Carolina | `e3355f39` | 6 |
| **Sin asignar** | NULL / NULL | **27,248** |
| IDs externos (webhook) | `3a4720ac`, `abc3ee9b`, etc. | ~3,900 |

**27,248 entradas no tienen agente asignado** (`reviewed_by` y `created_by` son NULL). Los IDs externos del webhook no existen en `profiles`. Esto explica por qué Carolina y Fabiana muestran pocos registros — solo tienen 6 y 8 entradas asignadas respectivamente. El sistema funciona correctamente; el problema es que la mayoría de entradas importadas nunca fueron asignadas a un agente.

### Bug 1: Selector no permite seleccionar agentes

**Causa raíz**: `CommandItem value={a.id}` usa UUIDs como valor. La librería cmdk filtra items comparando el texto que escribes en el input contra el `value` (lowercased). Escribir "Carolina" no matchea contra un UUID, y la selección puede fallar.

**Fix**: Cambiar `value={a.id}` → `value={a.name}` en ambos archivos. El `onSelect` usa closure (`a.id`) así que la selección sigue funcionando, y ahora la búsqueda por nombre funciona correctamente.

### Bug 2: LeadGen banner ya existe en código

El código de `LeadGenPerformanceView.tsx` ya tiene el banner con gradiente (líneas 75-111). Sin embargo, falta el `value` prop en `CommandItem` (línea 97). Se agregará `value={a.name}` para consistencia.

### Cambios

**`src/pages/promolog/PromologPerformanceView.tsx`** (línea 163):
```tsx
// De:
<CommandItem key={a.id} value={a.id} onSelect={() => { ... }}>
// A:
<CommandItem key={a.id} value={a.name} onSelect={() => { ... }}>
```

**`src/pages/leadgen/LeadGenPerformanceView.tsx`** (línea 97):
```tsx
// De:
<CommandItem key={a.id} onSelect={() => { ... }}>
// A:
<CommandItem key={a.id} value={a.name} onSelect={() => { ... }}>
```

### Nota sobre datos faltantes

Las 27,248 entradas sin agente no se pueden arreglar con código — requieren asignación manual o una regla de mapeo entre IDs externos del webhook y perfiles reales. Esto es un tema operativo/de datos, no un bug de UI.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `PromologPerformanceView.tsx` | `value={a.name}` en CommandItem |
| `LeadGenPerformanceView.tsx` | `value={a.name}` en CommandItem |

