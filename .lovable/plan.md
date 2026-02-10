
# Ajustar cada item de lineamiento como card individual segun la imagen de referencia

## Resumen

Cambiar la visualizacion de los items de lineamientos: en lugar de estar agrupados dentro de un unico contenedor `Card` con bordes internos (`border-b`), cada item sera una card independiente con bordes redondeados y separacion entre ellas. El contenido expandido sin datos mostrara un boton centrado "+ Agregar a [Nombre]" dentro de un area con borde punteado.

## Cambios

### 1. `src/pages/creadores/lineamientos/GuidelineItemRow.tsx`

- Cambiar el contenedor raiz de `border-b border-border last:border-b-0` a `rounded-lg border border-border bg-card` para que cada item sea una card independiente.
- En el contenido expandido sin datos (lineas 68-73), reemplazar el texto "Sin contenido" + link "Agregar" por un boton centrado con borde punteado:

```tsx
// Antes (expanded, sin guideline)
<div className="flex items-center gap-2">
  <p className="text-sm text-muted-foreground">Sin contenido</p>
  <Button variant="link">Agregar</Button>
</div>

// Despues
<div
  className="rounded-lg border-2 border-dashed border-border py-3 flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors"
  onClick={onAdd}
>
  <Plus className="h-4 w-4 mr-2 text-muted-foreground" />
  <span className="text-sm text-muted-foreground">Agregar a {item.title}</span>
</div>
```

### 2. `src/pages/creadores/LineamientosTabContent.tsx` (linea 271)

- Cambiar el contenedor que agrupa los items de cada categoria de `rounded-lg border border-border bg-card overflow-hidden` a `space-y-3` para que cada card individual tenga su propia separacion sin un wrapper compartido.

```tsx
// Antes
<div className="rounded-lg border border-border bg-card overflow-hidden">
  {cat.items.map(...)}
</div>

// Despues
<div className="space-y-3">
  {cat.items.map(...)}
</div>
```
