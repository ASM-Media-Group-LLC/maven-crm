

## Auto-formato del campo Medidas (80-60-90)

### Archivo a modificar

**`src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx`**

### Cambio

Reemplazar el `onChange` directo del campo "Medidas" (linea 118) por una funcion que auto-inserte guiones a medida que el usuario escribe, forzando el formato `XX-XX-XX`.

**Logica de la funcion `formatMedidas`:**
- Eliminar todo lo que no sea digito
- Insertar un guion automaticamente despues del 2do y 4to digito
- Limitar a 6 digitos maximo (formato `XX-XX-XX`)

```typescript
function formatMedidas(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "-" + digits.slice(2);
  return digits.slice(0, 2) + "-" + digits.slice(2, 4) + "-" + digits.slice(4);
}
```

En el Input de Medidas, el `onChange` pasara a llamar `onChange("medidas", formatMedidas(e.target.value))` en lugar de pasar el valor crudo. Se mantiene el `placeholder="90-60-90"` como referencia visual. Se agregara `maxLength={8}` al input (6 digitos + 2 guiones).

