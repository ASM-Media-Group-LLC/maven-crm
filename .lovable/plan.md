

# Redisenar cards del grid para layout vertical

## Cambio

Reorganizar el layout de cada card de horizontal (avatar a la izquierda, info a la derecha) a vertical, siguiendo el diseno de referencia.

## Layout objetivo (basado en screenshot)

```text
+---------------------------+
|  [Avatar]  Nombre Artistico|
|           Nombre Real...   |
|           [B] [Onboarding] |
|                             |
|  Flag Colombia, Bogota      |
|  Building Atomic Agency     |
| ─────────────────────────── |
|  [IG] [TT] [X]             |
+---------------------------+
```

## Detalle tecnico

### Archivo: `src/pages/creadores/CreadoresGrid.tsx`

1. **Cambiar layout del CardContent** de `flex gap-4` (horizontal) a una estructura con dos secciones:
   - **Header**: `flex gap-3` con avatar a la izquierda y nombre + badges a la derecha
   - **Body**: ubicacion y agencia como lineas independientes debajo del header
   - **Separador visual**: un `border-t` antes de los iconos sociales
   - **Footer**: iconos de redes sociales con tamano mas grande (h-4 w-4)

2. **Cambios especificos en clases**:
   - CardContent: cambiar de `flex gap-4 p-4` a `p-4 space-y-3`
   - Header section: `flex items-start gap-3` con avatar y bloque de texto
   - Nombre: texto `text-sm font-semibold text-primary`
   - Nombre real: `text-xs text-muted-foreground truncate`
   - Badges row: incluir categoria, status y icono RefreshCw en la misma fila
   - Location y agency: cada uno en su propia linea con `text-sm`
   - Separador: `<div className="border-t" />`
   - Social icons: tamano `h-4 w-4`, espaciado `gap-3`

3. **Sin cambios funcionales**: toda la logica de estado, click, modal y stopPropagation se mantiene igual.

