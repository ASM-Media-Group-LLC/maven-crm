
## Cambios en el sidebar: etiqueta "Ventas" y acceso a Config IA desde IA Ventas

### Cambios a realizar

**1. Renombrar el menú padre de "Ventas de Creadores" → "Ventas"**

El texto del `SidebarMenuButton` padre actualmente usa `t("nav.creatorSales")` que devuelve `"Ventas de Creadores"`. Se cambiará a texto directo `"Ventas"` en los tres lugares donde aparece (botón colapsable, tooltip del collapsed y span de texto).

**2. Eliminar "Config IA" como ítem separado y añadir icono de engranaje junto a "IA Ventas"**

Actualmente `creatorSalesSubItems` tiene 4 ítems incluyendo `"Config IA"` como una fila aparte. El plan es:
- Quitar `{ title: "Config IA", url: "/ai-sales-config" }` del array
- Renderizar "IA Ventas" de forma especial: el texto navega a `/aisales` y a su derecha aparece un pequeño icono `Settings` (engranaje) que navega a `/ai-sales-config`

El resultado visual en el submenú de Ventas quedaría:

```text
Ventas ▾
  ├─ Dashboard          → /sales-overview
  ├─ Reportes           → /salesdashboard
  └─ IA Ventas  ⚙       → /aisales  (⚙ → /ai-sales-config)
```

### Detalles técnicos

- En la versión expandida (no collapsed), el ítem "IA Ventas" se renderizará manualmente fuera del `.map()` del array, con un layout flex que incluya:
  - `NavLink` a `/aisales` con el texto "IA Ventas" (ocupa el espacio disponible)
  - Un botón con icono `Settings` (h-3 w-3) que navega a `/ai-sales-config` con `e.preventDefault()` para no interferir con el link padre
- En la versión collapsed (DropdownMenu), "Config IA" se eliminará del dropdown y en su lugar se añadirá un `DropdownMenuItem` "Config IA" justo debajo de "IA Ventas" para mantener el acceso.
- Se importa `Settings2` o el icono `Settings` ya importado desde lucide-react — `Settings` ya está importado, se reutiliza.

### Solo 1 archivo a modificar

- `src/components/dashboard/DashboardSidebar.tsx`
