

## Alinear el campo "Fecha de nacimiento"

### Problema

El boton del `DateInput` no ocupa todo el ancho disponible de su columna. Mientras que los demas campos (Input, Select) se expanden automaticamente al 100%, el `Button` del `DateInput` tiene un ancho intrinseco, causando que se vea mas corto y desalineado visualmente respecto al campo "Pais" que esta al lado.

### Solucion

Agregar la clase `w-full` al componente `DateInput` en el Paso 1 para que el boton-trigger ocupe todo el ancho de la columna, igualando visualmente a los demas campos.

### Cambio

**Archivo:** `src/pages/creadores/onboarding/steps/Step1PersonalInfo.tsx` (linea 159)

Cambiar:
```tsx
<DateInput value={data.birthDate} onChange={(v) => onChange("birthDate", v)} toYear={new Date().getFullYear()} />
```

Por:
```tsx
<DateInput className="w-full" value={data.birthDate} onChange={(v) => onChange("birthDate", v)} toYear={new Date().getFullYear()} />
```

Esto es suficiente porque el componente `DateInput` ya acepta `className` como prop y lo aplica al `Button` trigger interno.
