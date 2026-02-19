

## Ajustar nombres de las tabs de area

### Cambio

En `src/pages/creadores/onboarding/OnboardingContent.tsx`, linea 14, actualizar el array `areaTabs` con los nombres que aparecen en la imagen de referencia.

### Seccion tecnica

**Archivo:** `src/pages/creadores/onboarding/OnboardingContent.tsx` (linea 14)

Cambiar:
```ts
const areaTabs = ["Todos", "Ventas", "LeadGen", "Contenido", "Marketing", "Tecnología"];
```
Por:
```ts
const areaTabs = ["Todas", "Atomic Agency", "Elite Models", "Kash Agency", "Otra", "Unlok Platform"];
```

Tambien actualizar la logica de filtrado (linea 25) para que compare contra el campo correcto. Dado que ahora las tabs representan agencias (no areas), el filtro debe comparar contra `c.company` en lugar de `c.area`:

```ts
if (activeTab !== "Todas") {
  list = list.filter((c) => c.company.toLowerCase() === activeTab.toLowerCase());
}
```

