

## Estandarizar Modulo de Tareas: Sidebar, Header, Filtros y Vistas

### 1. Mover Tareas al grupo Menu en el Sidebar

**Archivo: `src/components/dashboard/DashboardSidebar.tsx`**

Mover "Tareas" del grupo "Operaciones" al grupo "Menu", posicionandolo despues de "Contactos":

```
const mainMenu = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Contactos", url: "/contactos", icon: UserPlus },
  { title: "Tareas", url: "/tareas", icon: CheckSquare },    // <-- nuevo
  { title: "Creadores", url: "/creadores", icon: Users },
  { title: "Eventos", url: "/eventos", icon: CalendarDays },
];
```

Eliminar el `SidebarMenuItem` de Tareas del grupo Operaciones (lineas 172-183).

---

### 2. Estandarizar header de ProjectsListContent (vista de proyectos)

**Archivo: `src/pages/tareas/ProjectsListContent.tsx`**

Cambiar de `<main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">` al patron estandarizado:

```
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold">Proyectos</h1>
        <p className="text-sm text-muted-foreground">Gestion de proyectos y tareas</p>
      </div>
      <Button variant="outline">
        <Plus /> Nuevo Proyecto
      </Button>
    </div>
  </header>
  <div className="flex-1 overflow-auto p-6 space-y-6">
    {/* KPIs, filtros + toggle, tabla/grid */}
  </div>
</main>
```

Agregar fila de filtros inline con:
- Buscador por nombre de proyecto
- Select de Estado (placeholder "Estado") con opciones: active, archived
- Toggle tabla/grid alineado a la derecha con `ml-auto`, usando `secondary`/`ghost`

---

### 3. Estandarizar header de TareasContent (vista de tareas dentro de un proyecto)

**Archivo: `src/pages/tareas/TareasContent.tsx`**

Aplicar el mismo patron de header sticky:

```
<main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
  <header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tareas")}>
          <ArrowLeft />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{projectName || "Tareas"}</h1>
          <p className="text-sm text-muted-foreground">Tareas del proyecto</p>
        </div>
      </div>
      <Button variant="outline">
        <Plus /> Nueva Tarea
      </Button>
    </div>
  </header>
  <div className="flex-1 overflow-auto p-6 space-y-6">
    {/* KPIs, filtros + toggle, tabla/grid */}
  </div>
</main>
```

Agregar fila de filtros inline con:
- Buscador por titulo de tarea
- Select de Estado (placeholder "Estado") con opciones: pending, completed, overdue
- Select de Asignado (placeholder "Asignado") con los perfiles de la empresa
- Toggle tabla/grid alineado a la derecha con `ml-auto`, usando `secondary`/`ghost`

---

### Resumen de archivos

| Archivo | Accion | Cambio |
|---------|--------|--------|
| `src/components/dashboard/DashboardSidebar.tsx` | Modificar | Mover Tareas de Operaciones a Menu (despues de Contactos) |
| `src/pages/tareas/ProjectsListContent.tsx` | Modificar | Header sticky, boton outline, buscador, select filter, toggle estandarizado |
| `src/pages/tareas/TareasContent.tsx` | Modificar | Header sticky, boton outline, buscador, select filters (estado + asignado), toggle estandarizado |

