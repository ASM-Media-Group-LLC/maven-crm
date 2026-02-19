
## Agregar efecto hover premium a las cards de Cantidad y Estados

### Qué se va a hacer
Aplicar el mismo efecto de hover que usan las KPI cards del Sales Overview a las cards de **Cantidad** y **Estados** del módulo LeadGen, y también a cada chip/fila individualmente.

### Efecto de hover actual (referencia de SalesKPICards)
```
hover:scale-[1.03]
hover:bg-gradient-to-br hover:from-{color}/15 hover:to-transparent
hover:border-{color}/40
hover:shadow-lg
transition-all duration-200
```

### Cambios propuestos

**`LeadGenCantidadCard.tsx`**

1. La `<Card>` envolvente recibe hover general con gradiente azul/primary:
   ```tsx
   <Card className="transition-all duration-200 hover:shadow-md hover:border-primary/30 hover:bg-gradient-to-br hover:from-primary/5 hover:to-transparent">
   ```

2. Cada chip de categoría (A+, A, B+, B, C) recibe hover con el color de su categoría + escala:
   ```tsx
   "hover:scale-[1.02] hover:shadow-sm hover:from-primary/10 ..."  // por cat
   ```
   Específicamente, añadir `hover:scale-[1.05] transition-all duration-150` a cada botón, y cuando está inactivo mostrar un hover tintado según la categoría:
   - A+: `hover:bg-primary/10 hover:border-primary/40`
   - A: `hover:bg-success/10 hover:border-success/40`
   - B+: `hover:bg-warning/10 hover:border-warning/40`
   - B: `hover:bg-warning/8 hover:border-warning/30`
   - C: `hover:bg-muted-foreground/10 hover:border-muted-foreground/40`

**`LeadGenEstadosCard.tsx`**

1. La `<Card>` envolvente recibe el mismo hover suave.

2. Cada fila de estado recibe un hover con el color del dot correspondiente y transición:
   - Respondieron: `hover:bg-primary/8 hover:border-l-primary/60`
   - Interesadas: `hover:bg-success/8 hover:border-l-success/60`
   - No interesadas: `hover:bg-destructive/8 hover:border-l-destructive/60`
   - Otros: `hover:bg-muted hover:border-l-muted-foreground/40`
   - Con Teléfono: `hover:bg-warning/8 hover:border-l-warning/60`
   
   Además agregar una flecha o indicador visual (`→`) que aparezca en hover para sugerir interactividad.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/leadgen/LeadGenCantidadCard.tsx` | Hover en `<Card>` + hover por color en cada chip de categoría |
| `src/pages/leadgen/LeadGenEstadosCard.tsx` | Hover en `<Card>` + hover por color en cada fila de estado |

Sin cambios en lógica, solo clases CSS de Tailwind.
