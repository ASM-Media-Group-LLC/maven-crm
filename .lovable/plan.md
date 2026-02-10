
# Agregar botones "Ver" y "Agregar" en el header de Lineamientos

## Resumen

Modificar el header del tab de Lineamientos para mostrar dos botones a la derecha, segun la imagen de referencia:
- **Ver** (icono Eye, variante default/dark) - abre un modal o vista con todos los lineamientos
- **Agregar** (icono ClipboardList/Plus, variante outline) - mantiene la funcionalidad actual de agregar

## Cambios en la imagen vs estado actual

Actualmente solo existe el boton "Agregar". La imagen muestra:
- Icono de ClipboardList a la izquierda con el titulo y subtitulo "0 registrados" debajo
- Dos botones a la derecha: "Ver" (fondo oscuro, icono Eye) y "Agregar" (outline, icono de documento)

## Detalle tecnico

### Archivo: `src/pages/creadores/LineamientosTabContent.tsx`

**Imports**: Agregar `Eye` de `lucide-react` (ya existe en el archivo pero confirmar uso).

**Cambios en el header** (lineas 187-198):

1. Reorganizar el lado izquierdo para mostrar titulo y conteo en formato vertical (titulo arriba, "X registrados" abajo), con el icono de ClipboardList al lado
2. Agregar contenedor con dos botones a la derecha:
   - Boton "Ver" con icono `Eye`, variante `default`, tamano `sm` - al hacer click abre el primer lineamiento en el modal de vista, o si no hay lineamientos, esta deshabilitado
   - Boton "Agregar" con icono `Plus`, variante `outline`, tamano `sm` - mantiene el `onClick={openAdd}` actual

**Estructura resultante:**

```
[icon] Lineamientos Operativos          [Ver] [Agregar]
       0 registrados
```

El boton "Ver" mostrara el listado existente haciendo scroll hacia abajo o si no hay guidelines estara deshabilitado. Dado que los lineamientos ya se muestran en la misma pagina, el boton "Ver" no necesita funcionalidad adicional compleja, pero puede servir para expandir/colapsar la lista de lineamientos.

### Sin cambios en otros archivos
