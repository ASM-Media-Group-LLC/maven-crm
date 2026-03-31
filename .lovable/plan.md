

## Plan: Fix scroll jump en stats cards de Closers

### Problema raíz

Cuando el usuario hace scroll y `scrollTop > 40`, las stats se colapsan. Esto **aumenta la altura** del contenedor de scroll, lo que puede hacer que el contenido se reposicione y `scrollTop` caiga por debajo de 40, re-expandiendo las stats. Esto crea un ciclo de colapso/expansión que produce el "salto".

### Solución

Cambiar la lógica a un **ratchet unidireccional**: una vez colapsado, solo se re-expande al cambiar de tab (nunca por scroll hacia arriba). Esto elimina el ciclo.

### Archivo a modificar

**`src/pages/closers/ClosersContent.tsx`** — línea 48-50:

```tsx
// Antes (bidireccional — causa el ciclo)
const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
  setStatsCollapsed(e.currentTarget.scrollTop > 40);
}, []);

// Después (ratchet — solo colapsa, no re-expande)
const handleContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
  if (e.currentTarget.scrollTop > 40) {
    setStatsCollapsed(true);
  }
}, []);
```

El reset `setStatsCollapsed(false)` en `onValueChange` del Tabs (línea 106) ya existe y se mantiene como único mecanismo para re-expandir.

