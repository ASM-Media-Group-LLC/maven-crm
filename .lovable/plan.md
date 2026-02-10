
# Redisenar estado vacio de Lineamientos segun imagen de referencia

## Resumen

Reemplazar el texto plano "Sin lineamientos creados..." por un estado vacio visual centrado con icono grande, titulo "Sin lineamientos", subtitulo "Documenta como manejar esta cuenta", y boton "+ Agregar" centrado. Todo dentro de un contenedor con fondo sutil y bordes redondeados.

## Detalle tecnico

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx` (lineas 211-215)

Reemplazar el bloque del estado vacio actual:

```tsx
{guidelines.length === 0 && (
  <div className="py-8 text-center text-sm text-muted-foreground">
    Sin lineamientos creados. Haz clic en <span className="font-medium">Agregar</span> para comenzar.
  </div>
)}
```

Por un contenedor con fondo `bg-muted/50`, bordes redondeados, padding generoso, y contenido centrado verticalmente:

- Icono `ClipboardList` grande (h-12 w-12) centrado, con color muted
- Titulo "Sin lineamientos" en texto semibold y tamano base
- Subtitulo "Documenta como manejar esta cuenta" en texto muted mas pequeno
- Boton "+ Agregar" con variante outline, que al hacer clic abre el modal selector de categorias (`setSelectorOpen(true)`)

Estructura:
```
[contenedor bg-muted/50 rounded-lg py-16]
  [icono ClipboardList grande centrado]
  "Sin lineamientos"
  "Documenta como manejar esta cuenta"
  [+ Agregar] (boton outline)
```

### Sin cambios en otros archivos
