

## Mejora de Steppers: Full-width + Gradientes premium

### Problema actual

1. **EmployeeNew**: El stepper esta limitado a `max-w-3xl mx-auto` dentro de la franja, no ocupa el ancho completo. Ademas, los circulos usan `bg-primary` plano (azul solido).
2. **OnboardingWizard**: El stepper esta dentro del `CardContent`, no tiene layout sticky. Los circulos tambien usan `bg-primary` plano. Tiene una barra `Progress` debajo pero sin gradiente.
3. **Ambos**: Los circulos activos/completados usan color plano sin el gradiente `from-accent to-primary` que ya es el estandar del boton `default` en la plataforma.

### Cambios a implementar

#### 1. `EmployeeNew.tsx` — Stepper full-width + gradiente

- Eliminar `max-w-3xl mx-auto` del contenedor del stepper para que ocupe todo el ancho disponible dentro del `px-6`
- Reemplazar `bg-primary text-primary-foreground` en los circulos por `bg-gradient-to-r from-accent to-primary text-white`
- Reemplazar `bg-primary` en las lineas de progreso completadas por `bg-gradient-to-r from-accent to-primary`
- Agregar una barra `Progress` debajo del stepper (como tiene OnboardingWizard) pero con gradiente aplicado al indicador

#### 2. `OnboardingWizard.tsx` — Stepper con gradiente

- Reemplazar `bg-primary text-primary-foreground` en los circulos por `bg-gradient-to-r from-accent to-primary text-white`
- El `ring-2 ring-primary/30` del paso activo cambia a `ring-accent/30` para que el halo sea coherente con el gradiente
- Aplicar gradiente al indicador de la barra `Progress` existente

#### 3. Componente `Progress` — Soporte de gradiente

El componente `progress.tsx` tiene el indicador hardcodeado con `bg-primary`. Para que ambos steppers muestren gradiente, se agregara una prop `indicatorClassName` que permita pasar clases personalizadas al indicador sin romper el uso actual del componente.

### Detalle tecnico del componente Progress

```text
// progress.tsx — agregar prop indicatorClassName
<ProgressPrimitive.Indicator
  className={cn("h-full w-full flex-1 bg-primary transition-all", indicatorClassName)}
  style={...}
/>
```

Uso en los steppers:
```text
<Progress value={...} className="h-1.5" indicatorClassName="bg-gradient-to-r from-accent to-primary" />
```

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/components/ui/progress.tsx` | Agregar prop `indicatorClassName` para permitir clases custom en el indicador |
| `src/pages/hr/EmployeeNew.tsx` | Eliminar `max-w-3xl mx-auto` del stepper; aplicar gradiente a circulos, lineas y agregar barra Progress con gradiente |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Aplicar gradiente a circulos del stepper y al indicador de la barra Progress |

