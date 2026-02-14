

## Crear Documentacion Oficial de Maven como nuevo modulo en Recursos

### Alcance

Crear una pagina completa `/docs` dentro de la plataforma, accesible desde el sidebar bajo el grupo "Recursos" (despues de Design System). El contenido sera renderizado como componentes React con formato profesional, sin dependencias externas adicionales.

### Estructura de archivos

| Archivo | Proposito |
|---------|-----------|
| `src/pages/Docs.tsx` | Wrapper con layout global (SidebarProvider, Sidebar, Topbar) |
| `src/pages/docs/DocsPage.tsx` | Componente principal con tabs de navegacion |
| `src/pages/docs/sections/VisionGeneralSection.tsx` | Seccion 1: Vision general de Maven |
| `src/pages/docs/sections/ArquitecturaSection.tsx` | Seccion 2: Arquitectura del sistema |
| `src/pages/docs/sections/ModulosSection.tsx` | Seccion 3: Documentacion por modulo |
| `src/pages/docs/sections/EscalabilidadSection.tsx` | Seccion 4: Escalabilidad |

### Navegacion y routing

1. **`src/App.tsx`**: Agregar ruta protegida `/docs` apuntando al componente `Docs`
2. **`src/components/dashboard/DashboardSidebar.tsx`**: Agregar entrada "Documentacion" con icono `FileText` en el grupo "Recursos", debajo de "Design System"

### Estructura de las 4 secciones (tabs)

La pagina usara el mismo patron de tabs del Design System: barra horizontal con botones `inline-flex rounded-lg border bg-muted/50 p-1`.

**Tab 1: Vision General**
- Proposito de Maven: plataforma de gestion operativa para agencias de creadores de contenido
- Problema que resuelve: fragmentacion de herramientas, falta de visibilidad, ineficiencias operativas
- Tipos de usuarios: Admin, Supervisor/Manager, Chatters/Specialists, Agents (LeadGen), Closers
- Flujo general del sistema (representado como diagrama de flujo textual con cards)
- Modulos principales listados con descripcion breve

**Tab 2: Arquitectura General**
- Mapa de modulos organizado visualmente en cards agrupadas por categoria (Gestion, Operaciones, Ventas, Recursos)
- Relaciones y dependencias entre modulos (tabla de dependencias)
- Flujo de datos: Lead -> Contacto -> Creador -> Monetizacion -> Reportes
- Permisos por rol (tabla matriz rol vs modulo con niveles de acceso)
- Stack tecnologico: React, Supabase, TanStack Query, Tailwind CSS

**Tab 3: Documentacion por Modulo**
Cada modulo documentado con un layout de accordion expandible (`Collapsible` o cards expandibles). Para cada uno:
- Objetivo
- Submodulos
- Funcionalidades principales
- Estados posibles
- Flujos internos
- Automatizaciones
- KPIs asociados
- Roles que interactuan
- Logica de negocio

Modulos a documentar:
1. Dashboard
2. Contactos
3. Tareas
4. Creadores (con perfil detallado)
5. Eventos
6. Creator Sales (Dashboard, Sales Report, AI Sales)
7. Promolog
8. LeadGen
9. Closers (Deals)
10. Tickets

**Tab 4: Escalabilidad**
- Arquitectura multi-tenant (company_id)
- Soporte para multiples creadoras (sin limite de registros)
- Soporte para multiples equipos (roles y asignaciones)
- Prevencion de reprocesos (automatizaciones, triggers, estados)
- Estrategia de crecimiento modular

### Diseno visual

- Mismo patron de header que Design System: titulo "Documentacion Maven", badge "v1.0", descripcion
- Cards con bordes `border-border bg-card` para agrupar contenido
- Tablas con el patron estandar del sistema (`text-xs`, bordes sutiles)
- Tipografia jerarquica: `text-3xl` para secciones, `text-xl` para subsecciones, `text-sm` para contenido
- Sin emojis, lenguaje profesional y ejecutivo
- Uso de iconos Lucide para encabezados de seccion (Target, Network, Layers, TrendingUp, etc.)

### Detalle tecnico

**`src/pages/Docs.tsx`** -- Mismo patron que `DesignSystem.tsx`:
```text
SidebarProvider
  div.flex.h-screen.w-full.overflow-hidden
    DashboardSidebar
    div.flex.flex-1.flex-col.min-w-0
      DashboardTopbar
      DocsPage
  ClariAiFab
```

**`src/pages/docs/DocsPage.tsx`** -- Mismo patron de tabs que `DesignSystemPage.tsx`:
```text
tabs = [
  { id: "vision", label: "Vision General" },
  { id: "arquitectura", label: "Arquitectura" },
  { id: "modulos", label: "Modulos" },
  { id: "escalabilidad", label: "Escalabilidad" },
]
```

**`src/components/dashboard/DashboardSidebar.tsx`** -- Agregar en grupo Recursos:
```text
Recursos
  Design System  (existente)
  Documentacion   (nuevo, icono FileText, ruta /docs)
```

**`src/App.tsx`** -- Nueva ruta:
```text
<Route path="/docs" element={<ProtectedRoute><Docs /></ProtectedRoute>} />
```

### Contenido de cada modulo (Tab 3)

Cada modulo se renderiza como un bloque `Collapsible` expandible. A continuacion el contenido clave por modulo:

**Dashboard**: Centro de mando con KPIs globales, grafico de rendimiento semanal, pipeline de deals, top creators, actividad reciente. Roles: todos.

**Contactos**: Registro y gestion de contactos comerciales. Estados: Nuevo, Contactado, En Proceso, Cerrado. Flujo: captura -> calificacion -> seguimiento. Roles: Agents, Managers.

**Tareas**: Gestion de tareas por proyecto con asignacion, conteo regresivo, estados (active, completed, overdue), compartir via token. Roles: todos.

**Creadores**: Ficha completa del creador con tabs (Info, Redes, Lineamientos, Monetizacion, Notas, Documentos, Historial, Tickets). Estados: activo, pausado, inactivo. Roles: Managers, Specialists.

**Eventos**: Planificacion y seguimiento de eventos con checklist, lista de invitados, asistencia, links compartibles. Estados: upcoming, in-progress, completed, cancelled. Roles: Managers, Admin.

**Creator Sales**: Dashboard de ventas con metricas de ingresos, comparativas, tendencias, rankings, AI Sales para analisis automatizado. Roles: Admin, Managers.

**Promolog**: Seguimiento de promociones por creadora en redes sociales. Registra red, tipo de contacto, accion tomada, ticket. Roles: Specialists, Chatters.

**LeadGen**: Captura y calificacion de prospectos. Estados: nuevo, contactado, calificado, descartado. Flujo de conversion a contacto. Roles: Agents.

**Closers**: Pipeline de deals con etapas (Nuevo -> Contactado -> Llamada Agendada -> En Llamada -> No Show -> Cerrado -> Perdido). Roles: Closers.

**Tickets**: Sistema de soporte interno vinculado a creadores. Tipos: technical, billing, content, other. Prioridades: low, medium, high, urgent. Estados: open, in-progress, resolved, closed. Roles: todos.

### Resumen de archivos a crear/modificar

| Archivo | Operacion |
|---------|-----------|
| `src/pages/Docs.tsx` | Crear |
| `src/pages/docs/DocsPage.tsx` | Crear |
| `src/pages/docs/sections/VisionGeneralSection.tsx` | Crear |
| `src/pages/docs/sections/ArquitecturaSection.tsx` | Crear |
| `src/pages/docs/sections/ModulosSection.tsx` | Crear |
| `src/pages/docs/sections/EscalabilidadSection.tsx` | Crear |
| `src/App.tsx` | Modificar (agregar ruta) |
| `src/components/dashboard/DashboardSidebar.tsx` | Modificar (agregar link en Recursos) |

