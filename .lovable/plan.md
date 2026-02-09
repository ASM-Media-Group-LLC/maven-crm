

# Bloquear campo "Porcentaje con Agencia" tambien en modo edicion

## Cambio

El campo "Porcentaje con Agencia" debe ser de solo lectura **siempre**, tanto en modo lectura como en modo edicion. No debe permitir modificacion en ningun caso.

## Detalle tecnico

En `src/pages/creadores/InfoTabContent.tsx`, lineas 286-304:

1. **Eliminar** la rama condicional `isEditing ? ... : ...` para este campo.
2. **Reemplazar** todo el bloque por un unico `InfoField` estatico que se muestre igual en ambos modos:
   ```
   <InfoField 
     label="Porcentaje con Agencia" 
     value={biz?.agency_percentage != null ? `${biz.agency_percentage}%` : null} 
   />
   ```
3. **Eliminar** `agency_percentage` del estado `editData` y de la funcion `handleSave`, ya que este campo nunca se edita desde el formulario.

## Archivo modificado
- `src/pages/creadores/InfoTabContent.tsx`

