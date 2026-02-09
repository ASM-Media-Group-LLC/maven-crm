

# Ajustar Logo y Limpiar Menú del Sidebar

## Resumen
Dos cambios: (1) agregar una variante extra-pequeña del logo para cuando el sidebar está colapsado, y (2) eliminar los items Chats, Contacts, Events y Analytics del menú.

## Cambios

### 1. `src/components/Logo.tsx` - Agregar variante `xs`
- Agregar tamaño `xs` con clase `text-base gap-1` para que el logo quepa cuando el sidebar se colapsa a modo icono
- Sin otros cambios al componente

### 2. `src/components/dashboard/DashboardSidebar.tsx`
- **Eliminar menu items**: Quitar Chats, Contacts, Events y Analytics del array `mainMenu`, dejando solo Dashboard
- **Logo responsivo al colapso**: Usar el hook `useSidebar` para detectar el estado colapsado y renderizar `Logo size="xs"` cuando está colapsado vs `size="sm"` cuando está expandido
- Limpiar imports no utilizados (`MessageSquare`, `Users`, `Calendar`, `BarChart3`)

## Detalle Técnico

**Logo.tsx - nueva variante:**
```typescript
const sizeClasses = {
  xs: "text-base gap-1",
  sm: "text-2xl gap-2",
  md: "text-4xl gap-2",
  lg: "text-7xl md:text-9xl gap-3",
};
```

**DashboardSidebar.tsx - menú simplificado:**
```typescript
const mainMenu = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
];
```

**DashboardSidebar.tsx - logo adaptativo:**
```typescript
const { state } = useSidebar();
const collapsed = state === "collapsed";
// En el header:
<Logo size={collapsed ? "xs" : "sm"} />
```

