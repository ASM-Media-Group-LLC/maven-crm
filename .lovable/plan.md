

# Corregir validacion del campo Edad

## Problema
El campo Edad tiene valor por defecto `18`, por lo que nunca muestra error de validacion al enviar el formulario vacio. El usuario espera que si no se ingresa una edad valida, se muestre el helper text de error.

## Cambios en `src/pages/creadores/NuevoCreadorForm.tsx`

### 1. Cambiar valor por defecto de `age` de `18` a `0`
Esto permite que el campo empiece vacio visualmente y que la validacion lo detecte.

### 2. Actualizar la validacion de edad
Cambiar la regla de `form.age < 18` a `!form.age || form.age < 18` para cubrir tanto el caso vacio (0) como edades menores a 18. Mensaje: "La edad minima es 18 anos".

### 3. Ajustar el Input de edad
Mostrar el campo vacio cuando el valor es `0` usando `value={form.age || ""}` para que no se vea un "0" en el input.

## Archivo modificado
- `src/pages/creadores/NuevoCreadorForm.tsx` (3 lineas)

