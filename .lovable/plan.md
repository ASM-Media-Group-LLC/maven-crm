

# Agregar submenu "Creator Sales" al sidebar

## Resumen

Reemplazar el item actual "Sales Dashboard" por un item colapsable "Creator Sales" con dos sub-items: "Dashboard" (`/salesdashboard`) y "Sales Report" (`/salesperformancecreator`), usando exclusivamente los componentes existentes del sidebar de shadcn.

## Componentes reutilizados

Se usaran componentes ya exportados en `src/components/ui/sidebar.tsx`:
- `SidebarMenuSub` (contenedor de sub-items con borde izquierdo e indentacion)
- `SidebarMenuSubItem` (wrapper de cada sub-item)
- `SidebarMenuSubButton` (boton del sub-item con estados hover/active)

Y de la libreria existente:
- `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent` de `@radix-ui/react-collapsible`
- `ChevronRight` de `lucide-react`
- `NavLink` de `@/components/NavLink`
- `useLocation` de `react-router-dom`

## Cambios

### Archivo: `src/components/dashboard/DashboardSidebar.tsx`

1. **Remover** "Sales Dashboard" del array `mainMenu` (vuelve a ser solo Dashboard y Creadores).

2. **Agregar imports**: `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`, `ChevronRight`, `useLocation`, `SidebarMenuSub`, `SidebarMenuSubItem`, `SidebarMenuSubButton`.

3. **Agregar logica** para detectar si la ruta actual esta dentro del submenu (`/salesdashboard` o `/salesperformancecreator`) y mantener el submenu abierto automaticamente.

4. **Agregar el item colapsable** despues del map de `mainMenu`, dentro del mismo `SidebarMenu`:

```tsx
<Collapsible defaultOpen={isCreatorSalesActive} className="group/collapsible">
  <SidebarMenuItem>
    <CollapsibleTrigger asChild>
      <SidebarMenuButton tooltip="Creator Sales">
        <TrendingUp className="h-4 w-4 shrink-0" />
        <span>Creator Sales</span>
        <ChevronRight className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
      </SidebarMenuButton>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <SidebarMenuSub>
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild isActive={pathname === "/salesdashboard"}>
            <NavLink to="/salesdashboard">Dashboard</NavLink>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild isActive={pathname === "/salesperformancecreator"}>
            <NavLink to="/salesperformancecreator">Sales Report</NavLink>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      </SidebarMenuSub>
    </CollapsibleContent>
  </SidebarMenuItem>
</Collapsible>
```

## Comportamiento

- Click en "Creator Sales" expande/colapsa el submenu.
- El chevron rota 90 grados al abrir.
- Si el usuario navega a `/salesdashboard` o `/salesperformancecreator`, el submenu se abre automaticamente via `defaultOpen`.
- Los sub-items tienen indentacion visual (borde izquierdo del `SidebarMenuSub`), hover y estado activo.
- En modo colapsado (icon), el submenu se oculta automaticamente (comportamiento nativo de `SidebarMenuSub`).

## Sin cambios en otros archivos

No se crean componentes nuevos, no se modifican estilos, no se agregan rutas. Solo se reestructura el sidebar.
