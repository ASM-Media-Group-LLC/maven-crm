

## Plan: Ajustar Detalle de Comisión

### Cambios en `src/pages/finanzas/comisiones/ComisionesTab.tsx` (líneas 184-186)

1. **Comisión** — Mostrar solo el porcentaje desde `calculation_config.percentage` (ej: `"20%"`), sin el monto
2. **Blue** (nueva fila) — Mostrar condicionalmente si `calculation_config.blue_package && blue_amount > 0`, con el monto formateado
3. **Empresa → "Valor para la Empresa"** — Renombrar label

```tsx
const config = viewItem.calculation_config || {};

// Línea 185: Comisión — solo porcentaje
<div className="flex justify-between">
  <span className="text-muted-foreground">Comisión</span>
  <span className="text-destructive font-medium">{config.percentage ? `${config.percentage}%` : "—"}</span>
</div>

// Nueva fila: Blue (condicional)
{config.blue_package && config.blue_amount > 0 && (
  <div className="flex justify-between">
    <span className="text-muted-foreground">Blue</span>
    <span className="font-medium">{fmt(config.blue_amount)}</span>
  </div>
)}

// Línea 186: Renombrar
<div className="flex justify-between">
  <span className="text-muted-foreground">Valor para la Empresa</span>
  <span className="text-primary font-medium">{fmt(Number(viewItem.final_amount) || 0)}</span>
</div>
```

### Archivo
- **Modificar**: `src/pages/finanzas/comisiones/ComisionesTab.tsx`

