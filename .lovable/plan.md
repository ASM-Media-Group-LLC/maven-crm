

# Mostrar bandera en la ubicacion del modal Ver Creador

## Problema
El campo `country_code` esta vacio (null) en todos los registros de la base de datos. El codigo actual intenta generar la bandera a partir de `country_code`, pero como no existe, nunca se muestra.

## Solucion
Crear un mapeo de nombres de paises (en espanol) a codigos ISO de 2 letras dentro de `ViewCreadorModal.tsx`, y usarlo como fallback cuando `country_code` es null.

## Cambios en `src/pages/creadores/ViewCreadorModal.tsx`

1. Agregar un diccionario `countryToCode` con los paises mas comunes en espanol:
   - Argentina -> AR, Chile -> CL, Colombia -> CO, Mexico -> MX, Venezuela -> VE, etc.

2. Modificar el calculo de `flag` para usar el nombre del pais como fallback:
   ```
   const code = c.country_code || countryToCode[c.country] || null
   const flag = getFlagEmoji(code)
   ```

Esto hara que la bandera se muestre junto a la ubicacion sin necesidad de modificar datos en la base de datos.

## Archivo modificado
- `src/pages/creadores/ViewCreadorModal.tsx`

