

## Alerta Visual (Punto Rojo) en la Card "En Onboarding"

### Archivo a modificar

**`src/pages/creadores/CreadorasDashboardContent.tsx`**

### Cambios

1. **Agregar un contador de pendientes** en el `useMemo` de `statusCounts`, rastreando por separado cuantas creadoras estan en estado `pendiente` o `pendiente_verificacion`. Se agregara una variable `pendingCount` derivada del mismo loop.

2. **Importar Tooltip** desde `@/components/ui/tooltip` para mostrar informacion contextual al pasar el mouse sobre el punto rojo.

3. **Renderizar el badge rojo** dentro de la Card de onboarding (lineas 118-140):
   - Agregar `relative` al className del `Card` cuando `key === "onboarding"`
   - Insertar un circulo rojo animado (con pulso) en la esquina superior derecha, condicionado a `pendingCount > 0`
   - Envolver el circulo en un `Tooltip` que muestre: "Tienes X registros por verificar"

### Detalle tecnico

```text
// Nuevo contador (junto al useMemo existente, lineas 25-33):
const pendingCount = useMemo(() => {
  return allCreators.filter(c => 
    c.status === "pendiente" || c.status === "pendiente_verificacion"
  ).length;
}, [allCreators]);

// Dentro del Card de onboarding (linea ~118), agregar clase relative:
className={`relative border-t-[3px] ...`}

// Antes del CardContent, solo para key === "onboarding" y pendingCount > 0:
<Tooltip>
  <TooltipTrigger asChild>
    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive/60" />
      <span className="relative inline-flex rounded-full h-4 w-4 bg-destructive" />
    </span>
  </TooltipTrigger>
  <TooltipContent>Tienes {pendingCount} registros por verificar</TooltipContent>
</Tooltip>
```

### Comportamiento

- Si `pendingCount > 0`: aparece un circulo rojo con animacion de pulso en la esquina superior derecha de la card azul, con tooltip informativo
- Si `pendingCount === 0`: el circulo desaparece automaticamente
- El click en la card sigue navegando a `/creadores/onboarding`
- El numero principal de la card sigue siendo 9 (total de onboarding)

