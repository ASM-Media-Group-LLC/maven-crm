

## Plan: Estandarizar estilo de AgentHourlyPerformance al design system

### Problema
El componente `AgentHourlyPerformance.tsx` (usado en la vista "Rendimiento por Hora" de LeadGen) tiene:
1. **KPI cards con `border-t-[3px]`** — no sigue el estándar (label arriba-izquierda, icono en badge arriba-derecha, hover con scale 1.03 y gradiente sutil)
2. **Quality cards con gradientes oscuros** (`from-emerald-600 to-emerald-900`, etc.) — debería usar `Card`/`CardContent` con badge de color y hover sutil, igual que `LeadGenCantidadCard`

### Cambios en `AgentHourlyPerformance.tsx`

#### 1. Reemplazar qualityCards config (líneas 16-22)
Usar el mismo patrón de `LeadGenCantidadCard.categoryConfig`:
- `Card` + `CardContent` con `p-4`
- Label arriba-izquierda, badge con icono arriba-derecha
- Valor bold grande con color semántico
- Hover: `hover:scale-[1.03]` + gradiente sutil

#### 2. Reemplazar KPI cards (líneas 133-167)
Cambiar las 3 cards (Última Hora, Total Hoy, Promedio por Hora) de `border-t-[3px]` a:
- Label arriba-izquierda (`text-sm text-muted-foreground`)
- Icono en badge coloreado arriba-derecha (`h-8 w-8 rounded-md bg-{color}/20`)
- Valor grande con color semántico
- Subtítulo descriptivo
- Hover con `scale-[1.03]` y gradiente sutil

#### 3. Renderizado de quality cards (líneas 170-178)
Reemplazar los `div` con gradientes por `Card`/`CardContent` con el estilo estándar

### Archivo a modificar
- `src/pages/leadgen/AgentHourlyPerformance.tsx`

