
## Fix: Sticky headers no funcionan por doble contexto de scroll

### Problema raiz

El componente `Table` en `src/components/ui/table.tsx` (linea 7) envuelve el `<table>` en:
```
<div className="relative w-full overflow-auto">
```

Este `overflow-auto` crea un segundo contenedor de scroll. El `sticky top-0` del `TableHeader` se posiciona relativo a este div interno (que no tiene altura limitada, asi que nunca hace scroll vertical). El div externo con `max-h-[calc(100vh-20rem)]` es el que realmente hace scroll, pero el `sticky` no responde a el.

### Solucion

Cambiar `overflow-auto` por `overflow-x-auto` en el componente `Table` (`src/components/ui/table.tsx`, linea 7). Esto:
- Mantiene el scroll horizontal para tablas anchas (necesario para columnas sticky left/right)
- Elimina el contexto de scroll vertical del div interno
- Permite que `sticky top-0` funcione correctamente con el contenedor externo que tiene `max-h`

### Cambio unico

| Archivo | Linea | Cambio |
|---------|-------|--------|
| `src/components/ui/table.tsx` | 7 | `overflow-auto` -> `overflow-x-auto` |

### Impacto

Este cambio afecta a TODAS las tablas del sistema (Eventos, Creadores, Contactos, Closers, Tickets, LeadGen, Tareas, Promolog, Earnings). Todas ya usan el patron de `max-h-[calc(...)] overflow-auto` en su contenedor externo para el scroll vertical, por lo que este cambio las beneficia igualmente — sus sticky headers tambien funcionaran correctamente.
