

## Plan: Ajustar layout de HRPermisoNew al patrón de NuevoContactoForm

### Problema
El formulario usa `max-w-lg` (512px) que restringe artificialmente el ancho de los inputs. La estructura del header y footer tampoco sigue el patrón establecido en `NuevoContactoForm`.

### Cambios en `src/pages/hr/HRPermisoNew.tsx`

**1. Wrapper principal** (línea 111)
- Cambiar de `flex flex-col h-full overflow-hidden` a `flex-1 flex flex-col h-full overflow-hidden min-w-0` (igual que NuevoContactoForm).

**2. Header** (líneas 112-128)
- Adoptar el patrón de NuevoContactoForm: breadcrumb (`Permisos › Nueva Solicitud`), botón "Volver" con texto, título `h1 text-2xl font-bold` con icono, y subtítulo.

**3. Contenido** (líneas 130-239)
- Eliminar `max-w-lg mx-auto`.
- Envolver el formulario en `div className="space-y-6 rounded-lg border border-border p-6"` (igual que NuevoContactoForm).
- Usar `grid grid-cols-1 md:grid-cols-2 gap-4` para agrupar campos en pares: Empleado + Tipo, Fecha + Horario. Motivo y Adjunto quedan a ancho completo.

**4. Footer** (líneas 242-255)
- Eliminar `max-w-lg mx-auto` del div interior para que los botones se alineen al borde derecho del contenido completo.

### Resultado
Los inputs ocuparán todo el ancho disponible (igual que en `/contactos/nuevo`), con campos agrupados en grid de 2 columnas en desktop.

