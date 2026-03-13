

## Plan: Alinear ClosersKPICards con el diseño de ContactosKPICards

Closers usa `div` con layout inline compacto. Contactos usa `Card`/`CardContent` con icon arriba-derecha, label arriba-izquierda, valor grande abajo, subtitle, hover con scale+gradient. Hay que replicar ese patrón exacto.

### Cambio único: `src/pages/closers/components/ClosersKPICards.tsx`

Reescribir para usar el mismo patrón visual de Contactos:
- `Card` + `CardContent` de shadcn
- Layout: label (arriba-izq) + icon en badge colored (arriba-der) + valor `text-2xl font-bold` + subtitle
- Grid: `grid-cols-2 md:grid-cols-4` (con 7 cards se distribuyen en 2 filas)
- Hover: `hover:scale-[1.03] hover:bg-gradient-to-br hover:from-{color}/15`
- Cada card con su `colorClass`, `bgClass`, `hoverClass` y `subtitle`

Cards (7 total, 4+3 layout):
1. Total Leads — muted — "Registrados"
2. Sin Contactar — primary — "Pendientes"
3. Contactados — accent — "Respondieron"
4. Interesadas — warning — "Con interés"
5. En Negociación — warning — "En proceso"
6. Confirmadas — success — "Listas"
7. Completadas — success — "Finalizadas"

