

## Fix Sidebar Hovers + Glass Effect + Topbar Account & Notifications

### 1. Sidebar: Fix Recursos y Settings hover + Glass effect

**Problema**: Los items de "Recursos" (Design System, Documentacion) y "Settings" usan `hover:bg-muted hover:text-foreground` que es practicamente invisible en dark mode.

**Solucion**: Reemplazar el hover neutro por un efecto glass con gradiente violeta-azul. Se creara una clase CSS `.sidebar-glass-hover` en `src/index.css` que aplique:
- `backdrop-blur-md`
- Fondo con gradiente sutil de primary a accent (azul a violeta) con opacidad baja
- Borde semi-transparente
- Transicion suave

```text
.sidebar-glass-hover:hover {
  background: linear-gradient(135deg, hsl(var(--primary) / 0.08), hsl(var(--accent) / 0.08));
  backdrop-filter: blur(12px);
  border-color: hsl(0 0% 100% / 0.06);
}
```

Estado activo para Recursos/Settings:
```text
.sidebar-glass-active {
  background: linear-gradient(135deg, hsl(var(--primary) / 0.12), hsl(var(--accent) / 0.12));
  border-left: 2px solid hsl(var(--accent));
  color: hsl(var(--accent));
}
```

**Archivo**: `src/index.css` - agregar las 2 clases utilitarias
**Archivo**: `src/components/dashboard/DashboardSidebar.tsx` - aplicar las nuevas clases a Recursos y Settings

### 2. Topbar: Notificaciones funcionales

Habilitar el boton de notificaciones (quitar `disabled`) y agregar un popover/dropdown con estado vacio ("Sin notificaciones nuevas") como placeholder funcional con un badge de conteo.

### 3. Topbar: Cuenta de usuario con avatar, nombre y correo

Reemplazar el avatar suelto + boton logout por un componente de cuenta completo:
- Avatar con iniciales (ya existe)
- Nombre del usuario (`user.user_metadata.full_name` o "Usuario")
- Email del usuario (`user.email`)
- Al hacer click se abre un `DropdownMenu` con:
  - Header: Avatar + nombre + email
  - Separador
  - Opcion "Cambiar contrasena" (abre modal con formulario)
  - Opcion "Cerrar sesion" (ejecuta signOut existente)
- Eliminar el boton LogOut suelto (se mueve dentro del dropdown)

### 4. Modal de cambio de contrasena

Crear un `Dialog` simple con:
- Input de nueva contrasena (con toggle de visibilidad)
- Input de confirmar contrasena
- Boton "Actualizar contrasena" que llama a `supabase.auth.updateUser({ password })`
- Validacion de que ambas contrasenas coincidan
- Toast de confirmacion

### Archivos a modificar/crear

| Archivo | Cambio |
|---------|--------|
| `src/index.css` | Agregar `.sidebar-glass-hover` y `.sidebar-glass-active` |
| `src/components/dashboard/DashboardSidebar.tsx` | Aplicar glass hover a Recursos y Settings |
| `src/components/dashboard/DashboardTopbar.tsx` | Redisenar zona de cuenta con dropdown + notificaciones activas |
| `src/components/dashboard/ChangePasswordModal.tsx` | Crear - modal para cambiar contrasena |

### Estructura del Topbar rediseñado

```text
[SidebarTrigger] [---- Search ----] [ThemeToggle] [Bell+Badge] [Avatar + Nombre ▼]
                                                                     |
                                                              DropdownMenu:
                                                              ┌──────────────────┐
                                                              │ Avatar           │
                                                              │ Nombre completo  │
                                                              │ email@correo.com │
                                                              ├──────────────────┤
                                                              │ Cambiar password │
                                                              │ Cerrar sesion    │
                                                              └──────────────────┘
```

