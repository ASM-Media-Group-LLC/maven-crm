
## Agregar grupo "Recursos" al Sidebar

### Cambio unico

**Archivo: `src/components/dashboard/DashboardSidebar.tsx`**

Agregar un nuevo grupo "Recursos" entre el grupo "Operaciones" y el SidebarSeparator + Settings. Incluira un enlace al Sistema de Diseno.

Cambios especificos:
1. Importar el icono `Palette` de lucide-react (para representar el Design System)
2. Insertar un nuevo `SidebarGroup` con label "Recursos" despues del grupo "Operaciones" (linea 187) y antes del `SidebarSeparator` (linea 189)
3. Dentro del grupo, un `SidebarMenuItem` con NavLink a `/design-system` usando el icono `Palette` y texto "Design System"
4. Seguir el mismo patron de NavLink con las clases estandar de hover y active

Estructura resultante del sidebar:
- **Menu**: Dashboard, Contactos, Tareas, Creadores, Eventos, Creator Sales (submenu)
- **Operaciones**: Promolog, LeadGen, Closers, Tickets
- **Recursos**: Design System
- *(separador)*
- Settings

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardSidebar.tsx` | Importar `Palette`, agregar grupo "Recursos" con enlace a Design System |
