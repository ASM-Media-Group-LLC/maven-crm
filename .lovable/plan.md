

## Plan: Corregir mensaje "Sin porcentaje configurado" en comisiones por tramos

### Problema
En `NuevaComisionModal.tsx` (líneas 191-199), cuando hay un creador seleccionado con comisión por tramos pero no se han ingresado ganancias (`base === 0`), `agencyPct` es 0 y se muestra erróneamente "Sin porcentaje configurado". El porcentaje no se puede determinar hasta que se ingrese un monto.

### Cambio
En la condición de la línea 193, agregar una verificación: si el tipo de comisión es `tiered` y `base === 0`, mostrar "—" en lugar del mensaje de error. Solo mostrar "Sin porcentaje configurado" cuando realmente no hay porcentaje configurado (tipo fijo con 0%).

**Archivo**: `src/pages/finanzas/comisiones/NuevaComisionModal.tsx` (líneas 191-199)

Lógica actualizada:
```tsx
{creatorId && agencyPct > 0 ? (
  <span className="font-medium">{agencyPct}%</span>
) : creatorId && agencyPct === 0 && commType === "fixed" ? (
  <span className="text-destructive text-xs flex items-center gap-1">
    <AlertCircle className="h-3 w-3" /> Sin porcentaje configurado
  </span>
) : (
  <span className="text-muted-foreground">—</span>
)}
```

Esto muestra el error solo cuando el tipo es fijo y el porcentaje es 0 (realmente no configurado). Para tramos sin ganancias ingresadas, muestra "—".

