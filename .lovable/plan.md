

## Submenu accesible en sidebar contraido + Logo favicon "M"

### 1. Logo con version favicon cuando el sidebar esta contraido

**Archivo: `src/components/Logo.tsx`**

Agregar una prop `collapsed` (o reutilizar el tamano `xs`) para que cuando el sidebar este contraido, el logo muestre solo la "M" con el gradiente, sin "aven" ni "CRM".

Cambio concreto:
- Agregar prop opcional `collapsed?: boolean`
- Cuando `collapsed` es `true`, renderizar solo la letra "M" con el mismo gradiente (`bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent`) y tamano apropiado para el sidebar contraido (3rem de ancho)
- Cuando `collapsed` es `false`, mostrar el logo completo "MavenCRM" como actualmente

**Archivo: `src/components/dashboard/DashboardSidebar.tsx`**

Pasar `collapsed={collapsed}` al componente Logo en lugar de solo cambiar el tamano.

### 2. Submenu "Creator Sales" accesible en sidebar contraido

Actualmente el submenu usa `Collapsible` + `CollapsibleContent`, que se oculta completamente cuando el sidebar esta en modo icono (`group-data-[collapsible=icon]:overflow-hidden`). Esto hace que los subitems sean inaccesibles.

**Solucion:** Cuando el sidebar esta contraido, reemplazar el `Collapsible` por un `DropdownMenu` que se abre al hacer hover/click sobre el icono de `TrendingUp`. Esto permite acceder a los subitems desde un popover lateral sin expandir el sidebar.

**Archivo: `src/components/dashboard/DashboardSidebar.tsx`**

Cambio concreto:
- Importar `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` de `@/components/ui/dropdown-menu`
- Envolver el bloque del submenu Creator Sales en una condicion:
  - **Si `collapsed` es `true`**: Renderizar un `DropdownMenu` con trigger en el boton del sidebar (icono `TrendingUp`), y los subitems como `DropdownMenuItem` que navegan a sus rutas respectivas usando `useNavigate`
  - **Si `collapsed` es `false`**: Mantener el `Collapsible` actual sin cambios

### Detalle tecnico del DropdownMenu en modo colapsado

```text
collapsed === true:
  DropdownMenu
    DropdownMenuTrigger -> SidebarMenuButton con icono TrendingUp + tooltip
    DropdownMenuContent side="right" align="start"
      DropdownMenuItem -> "Dashboard" -> navigate("/sales-overview")
      DropdownMenuItem -> "Sales Report" -> navigate("/salesdashboard")
      DropdownMenuItem -> "Sale Report v.1" -> navigate("/salesperformancecreator")
      DropdownMenuItem -> "AI Sales" -> navigate("/aisales")
      DropdownMenuItem -> "AI Config" -> navigate("/ai-sales-config")

collapsed === false:
  (sin cambios - Collapsible actual)
```

### Resumen de archivos

| Archivo | Cambio |
|---------|--------|
| `src/components/Logo.tsx` | Agregar prop `collapsed` para mostrar solo "M" cuando esta contraido |
| `src/components/dashboard/DashboardSidebar.tsx` | Pasar `collapsed` al Logo + reemplazar Collapsible por DropdownMenu cuando esta colapsado |

