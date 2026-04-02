
## Plan: Reemplazar inputs de teléfono inline por el componente PhoneInput compartido

### Problema
Los formularios de `/contactos` (NuevoContactoForm) y `/leadgen` (AddContactoModal) **no usan** el componente `PhoneInput` actualizado. Tienen sus propios selectores de país inline con `<Select>` básico (sin buscador, lista corta de países). Por eso no ves los cambios.

### Cambios

**1. `src/pages/contactos/NuevoContactoForm.tsx`**
- Importar `PhoneInput` de `@/components/ui/phone-input`
- Reemplazar el bloque de `<Select>` + `<Input>` de teléfono (líneas 372-379) por `<PhoneInput value={fullPhone} onChange={...} />`
- Eliminar el campo `countryCode` del estado del formulario — el `PhoneInput` ya lo maneja internamente concatenando código+número
- Ajustar las referencias a `form.countryCode` y `form.phone` para que usen el valor combinado del PhoneInput
- Eliminar la constante `COUNTRY_CODES` local si existe

**2. `src/pages/leadgen/AddContactoModal.tsx`**
- Importar `PhoneInput` de `@/components/ui/phone-input`
- Reemplazar el bloque de dos FormFields (`paisCodigo` + `telefono`, líneas 339-371) por un solo `<PhoneInput>`
- Eliminar `paisCodigo` del schema de zod y del defaultValues
- Ajustar el submit para parsear el valor combinado del PhoneInput (extraer código de país y número)

### Resultado
- Ambos formularios usarán el mismo selector con buscador cmdk, 50+ países, y despliegue hacia abajo
- Un solo componente a mantener para toda la app

### Archivos a modificar
1. `src/pages/contactos/NuevoContactoForm.tsx`
2. `src/pages/leadgen/AddContactoModal.tsx`
