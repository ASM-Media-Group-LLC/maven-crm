
## Ajustar altura de las tarjetas KPI en Promolog

### Problema
Las tarjetas KPI se ven demasiado altas/largas. Actualmente tienen mucho espaciado vertical (`space-y-0.5` entre elementos) y padding generoso (`p-5`).

### Solución propuesta

**Archivo a modificar:** `src/pages/promolog/PromologContent.tsx`

**Cambios en la sección "KPI Cards" (línea 182-196):**

1. **Reducir padding vertical**: cambiar `p-5` a `px-5 py-3` (padding horizontal 1.25rem, vertical 0.75rem)
   - Esto reduce significativamente el espacio vertical sin afectar el espaciado horizontal

2. **Comprimir espaciado entre elementos**: cambiar `space-y-0.5` a `space-y-0` (eliminar espacios verticales entre título, valor y subtítulo)
   - Los elementos estarán más pegados, creando una tarjeta más compacta

3. **Opcional - Reducir tamaño de fuentes**:
   - El título `text-xs` se mantiene igual
   - El valor `text-2xl` podría reducirse a `text-xl` si aún se ve muy grande
   - El subtítulo `text-xs` se mantiene igual

### Cambios específicos

```tsx
// Antes
<CardContent className="flex items-start gap-4 p-5">
  <div>...</div>
  <div className="flex-1 space-y-0.5">
    {/* contenido */}
  </div>
</CardContent>

// Después
<CardContent className="flex items-start gap-4 px-5 py-3">
  <div>...</div>
  <div className="flex-1 space-y-0">
    {/* contenido */}
  </div>
</CardContent>
```

### Impacto
- Las tarjetas serán notablemente más compactas verticalmente
- Se mantiene la legibilidad del contenido
- El diseño general se verá más limpio y denso
- Las 4 columnas en desktop seguirán siendo visibles sin cambios en el grid

### Alternativas si se necesita más compresión
- Cambiar el valor de `text-2xl` a `text-xl` para números más pequeños
- Cambiar el icono a `h-4 w-4` (actualmente es `h-5 w-5`)
- Cambiar contenedor de icono de `h-10 w-10` a `h-9 w-9`
