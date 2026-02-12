

# Agregar sección "Operaciones" con "LeadGen" al Sidebar

## Resumen

Reorganizar el sidebar para incluir una nueva sección llamada **Operaciones** que contenga el item **LeadGen**, siguiendo el estilo visual de la imagen de referencia. La sección actual "Menu" se mantiene y se agrega "Operaciones" como un nuevo grupo debajo.

## Cambios

### `src/components/dashboard/DashboardSidebar.tsx`

- Importar el icono `TrendingDown` (o `Activity`) de lucide-react para representar LeadGen (similar al icono zigzag de la referencia)
- Crear un nuevo grupo "Operaciones" con su `SidebarGroupLabel`
- Agregar el item "LeadGen" con su ruta `/leadgen` dentro de este grupo
- Posicionar el grupo "Operaciones" entre el grupo "Menu" actual y el separador/settings
- La ruta `/leadgen` por ahora apuntara a una pagina placeholder

### `src/pages/LeadGen.tsx` (nuevo)

- Pagina placeholder con el layout estandar (sidebar + topbar)
- Contenido basico con titulo "LeadGen" y mensaje de "Coming soon" o similar

### `src/App.tsx`

- Registrar la nueva ruta `/leadgen` apuntando al componente `LeadGen`

## Seccion tecnica

**Estructura del nuevo grupo en el sidebar:**

```text
<SidebarGroup>
  <SidebarGroupLabel>Operaciones</SidebarGroupLabel>
  <SidebarGroupContent>
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip="LeadGen">
          <NavLink to="/leadgen" ...>
            <Activity className="h-4 w-4 shrink-0" />
            <span>LeadGen</span>
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarGroupContent>
</SidebarGroup>
```

**Orden de los grupos en el sidebar:**

```text
1. Menu (Dashboard, Creadores, Eventos, Creator Sales)
2. Operaciones (LeadGen)
3. Settings
```

