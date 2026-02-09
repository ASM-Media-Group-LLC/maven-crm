

# Eliminar botón "Subir Archivos" de Fotos de PickLink

## Cambio
Eliminar el botón "Subir Archivos" que aparece en la sección condicional de PickLink (línea ~429 de `NuevoCreadorForm.tsx`), dentro del bloque `has_piclink`.

## Archivo modificado
- `src/pages/creadores/NuevoCreadorForm.tsx` — Eliminar el `<Button>` de "Subir Archivos" y su `onClick` asociado en la sección de "Fotos de PickLink (Comprobante)" (aproximadamente líneas 427-430).

Se mantiene el texto "Fotos de PickLink (Comprobante)" y la lista de archivos subidos si existen, solo se quita el botón.

