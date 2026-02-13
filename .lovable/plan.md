
## Ajustar etiquetas de opciones en el dropdown "Puntuación del Trabajo"

### Cambio Requerido

**Archivo**: `src/pages/leadgen/AssignCalidadModal.tsx`

**Línea 43-47** - Actualizar el arreglo `puntuacionOptions`:

Cambiar las etiquetas de las opciones para que sean más descriptivas:

**Actual**:
```tsx
const puntuacionOptions = [
  { value: "alto", label: "Alto" },
  { value: "medio", label: "Medio" },
  { value: "bajo", label: "Bajo" },
];
```

**Nuevo**:
```tsx
const puntuacionOptions = [
  { value: "alto", label: "Alto — Excelente trabajo" },
  { value: "medio", label: "Medio — Trabajo aceptable" },
  { value: "bajo", label: "Bajo — Necesita mejorar" },
];
```

### Impacto

- Las opciones en el dropdown "Puntuación del Trabajo" mostrarán ahora etiquetas más descriptivas que ayudan al usuario a entender mejor qué significa cada nivel de puntuación
- Los valores internos (`alto`, `medio`, `bajo`) se mantienen igual, por lo que no hay cambios en la lógica o persistencia de datos
- El cambio es puramente visual en la interfaz del usuario

### Resultado

El dropdown "Puntuación del Trabajo" mostrará:
- "Alto — Excelente trabajo"
- "Medio — Trabajo aceptable"
- "Bajo — Necesita mejorar"

