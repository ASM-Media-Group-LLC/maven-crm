

## Ajustar tabs de area al estilo de la imagen de referencia

### Cambios visuales

La imagen muestra un contenedor con borde visible y fondo semi-transparente, con la tab activa en un color purpura vibrante (coincide con el gradiente del boton `default`) y las inactivas como texto plano.

### Seccion tecnica

**Archivo:** `src/pages/creadores/onboarding/OnboardingContent.tsx` (lineas 76-88)

Cambios:

1. **Contenedor** (linea 76): Cambiar `bg-muted p-1` por `border border-border bg-muted/50 p-1` para agregar el borde visible y fondo semi-transparente.

2. **Tab activa** (linea 81): Cambiar variante de `secondary` a `default` para obtener el gradiente purpura.

3. **Tab inactiva** (linea 81): Mantener `ghost`.

4. **Tamano de texto** (linea 83): Quitar `text-xs` para usar el tamano por defecto (`text-sm`), que es mas grande y coincide con la imagen.

Resultado:
```tsx
<div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
  {areaTabs.map((tab) => (
    <Button
      key={tab}
      size="sm"
      variant={activeTab === tab ? "default" : "ghost"}
      onClick={() => setActiveTab(tab)}
    >
      {tab}
    </Button>
  ))}
</div>
```

