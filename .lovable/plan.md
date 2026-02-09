

# Bloquear campo "Porcentaje con Agencia" en modo lectura

## Cambio

En `src/pages/creadores/InfoTabContent.tsx`, el campo "Porcentaje con Agencia" en modo lectura (no editing) debe mostrarse como texto estatico igual que los demas campos, sin permitir edicion.

## Detalle tecnico

1. **Eliminar** el estado local `agencyPct`, `initialAgencyPct` y la funcion `handleAutoSavePercentage` (ya no se necesitan porque no hay auto-save en modo lectura).

2. **Modo lectura** (lineas ~296-309): reemplazar el input editable por un `InfoField` estatico que muestre el valor con el sufijo `%`, igual que cualquier otro campo de solo lectura:
   - Si hay valor: mostrar `"50%"` (por ejemplo)
   - Si no hay valor: mostrar `"—"`

3. **Modo edicion** (lineas ~285-295): se mantiene el input numerico como esta, ya que en modo edicion si debe ser editable. Este campo se guarda junto con los demas al hacer clic en "Guardar".

## Archivo modificado
- `src/pages/creadores/InfoTabContent.tsx`

