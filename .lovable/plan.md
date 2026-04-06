
# Plan: Restringir Dashboard 2 solo a admins

## Cambios

### 1. Ruta protegida — `src/App.tsx` (línea 212)
Envolver `Dashboard2` con `AdminRoute` en vez de `ProtectedRoute`:
```tsx
<Route path="/dashboard2" element={<AdminRoute><Dashboard2 /></AdminRoute>} />
```

### 2. Sidebar — `src/components/dashboard/DashboardSidebar.tsx` (línea 42)
Agregar una propiedad `adminOnly: true` al item de Dashboard v2 y filtrarlo del menú para no-admins. Opción más simple: condicionar directamente con `isAdmin` del hook `useUserRole`.

## Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `App.tsx` | `ProtectedRoute` → `AdminRoute` para `/dashboard2` |
| `DashboardSidebar.tsx` | Ocultar "Dashboard v2" del menú si el usuario no es admin |
