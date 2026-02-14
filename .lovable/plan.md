

## Mover el toggle de tema (claro/oscuro) al Topbar de la plataforma

### Problema
El boton de cambio de tema solo existe dentro del Design System. Deberia estar accesible globalmente desde cualquier pagina.

### Solucion
Mover el componente `ThemeToggle` al `DashboardTopbar.tsx` para que sea accesible desde toda la plataforma, y eliminarlo del header del Design System.

### Cambios

**1. `src/components/dashboard/DashboardTopbar.tsx`**
- Importar `useTheme` de `next-themes`, `Sun` y `Moon` de `lucide-react`, y `useState`/`useEffect` de React
- Agregar la logica del toggle de tema (misma que existe en DesignSystemPage)
- Colocar el boton de tema en la zona derecha del topbar, antes del boton de notificaciones, como un `Button variant="ghost" size="icon"` con el icono `Sun` o `Moon` segun el tema activo

Ubicacion en el topbar:
```text
[SidebarTrigger] --- [Search] --- [ThemeToggle] [Bell] [Avatar] [LogOut]
```

**2. `src/pages/design-system/DesignSystemPage.tsx`**
- Eliminar el componente `ThemeToggle` y sus imports asociados (`useTheme`, `Sun`, `Moon`, `useState`, `useEffect` si ya no se usan)
- En el header, quitar la referencia a `<ThemeToggle />` y mantener solo el titulo y badge

### Archivos

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardTopbar.tsx` | Agregar boton de toggle de tema con `useTheme` |
| `src/pages/design-system/DesignSystemPage.tsx` | Eliminar ThemeToggle del header |

