
# Ajustar botones "Ver" y "Agregar" al estilo de tabs contenidas

## Resumen

Cambiar los botones "Ver" y "Agregar" de botones separados a un grupo contenido tipo "tabs" con fondo sutil, siguiendo el patron de filtros de agencia ya existente en el proyecto. El boton activo usa variante `secondary` y el inactivo `ghost`, todo dentro de un contenedor `inline-flex` con borde redondeado y fondo `bg-muted/50`.

## Detalle tecnico

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx` (lineas 178-196)

Reemplazar el `div` contenedor de los botones:

**Antes:**
```tsx
<div className="flex items-center gap-2">
  <Button variant="outline" size="sm" ...>
    <Eye /> Ver
  </Button>
  <Button variant={showCategories ? "outline" : "default"} size="sm" ...>
    <Plus /> Agregar
  </Button>
</div>
```

**Despues:**
```tsx
<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
  <Button
    variant={showList && !showCategories ? "secondary" : "ghost"}
    size="sm"
    disabled={guidelines.length === 0}
    onClick={() => { setShowList(v => !v); setShowCategories(false); }}
  >
    <Eye className="h-4 w-4 mr-1" />
    Ver
  </Button>
  <Button
    variant={showCategories ? "secondary" : "ghost"}
    size="sm"
    onClick={() => { setShowCategories(v => !v); setShowList(false); }}
  >
    <ClipboardList className="h-4 w-4 mr-1" />
    Agregar
  </Button>
</div>
```

Cambios clave:
- Contenedor con `inline-flex rounded-lg border border-border bg-muted/50 p-1` para el efecto de grupo
- Gap reducido a `gap-1` entre botones
- Variantes cambian a `secondary` (activo) y `ghost` (inactivo), siguiendo el patron de filtros de agencia
- Icono de "Agregar" cambia de `Plus` a `ClipboardList` (icono de documento/edicion como en la imagen de referencia)
- Al activar un boton, se desactiva el otro para comportamiento exclusivo
