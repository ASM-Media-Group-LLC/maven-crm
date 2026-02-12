

# Crear pagina de Contactos con listado, filtros y formulario

## Resumen

Se creara una nueva seccion "Contactos" accesible desde el sidebar (antes de Creadores), con un listado completo de contactos que incluye KPI cards con hover, filtros, buscador, vistas list/grid, tabla con scroll interno y header fijo. Ademas, se creara la pagina de formulario "Nuevo Contacto" siguiendo el diseno de referencia.

## Archivos a crear

### 1. `src/pages/Contactos.tsx`
Pagina wrapper con SidebarProvider + DashboardSidebar + DashboardTopbar + ContactosContent (mismo patron que Creadores.tsx y LeadGen.tsx).

### 2. `src/pages/contactos/ContactosContent.tsx`
Componente principal con:

**Header fijo (shrink-0):**
- Titulo "Directorio de Contactos" + subtitulo "Total: X contactos"
- Boton primario "+ Agregar Contacto" que navega a /contactos/nuevo

**KPI Cards (4 columnas):**
- Total Contactos (icono Users, color default)
- Nuevos (icono UserPlus, color primary)
- Convertidos (icono CheckSquare, color success)
- Este Mes (icono CalendarDays, color warning)
- Todas con hover scale 1.03 + gradiente (patron existente de CreadoresKPICards)

**Barra de filtros:**
- Buscador "Buscar por ticket, nombre, handle..."
- Selectores: Estado, Pais, Categoria, Fecha creacion
- Toggle list/grid

**Tabla (vista list):**
- Columnas: Creacion, Ticket, Nombre, Estado (Badge con dropdown), Instagram (con icono + link externo), Pais, Categoria (Badge), WhatsApp ("Chat" link), Inter. (numero), Creado por, Acciones (...)
- Scroll interno con max-h calculado y header sticky
- Todas las columnas con ordenacion

**Vista grid:**
- Cards con avatar, nombre, ticket, estado badge, categoria badge, pais, Instagram handle, con hover effects

**Datos mock** para preview visual.

### 3. `src/pages/contactos/ContactosTable.tsx`
Tabla con sorting en todas las columnas, scroll interno (max-h-[calc(100vh-24rem)]), header sticky.

### 4. `src/pages/contactos/ContactosGrid.tsx`
Vista grid con cards (patron similar a CreadoresGrid).

### 5. `src/pages/contactos/ContactosKPICards.tsx`
4 KPI cards con hover effects (scale 1.03 + gradiente).

### 6. `src/pages/contactos/ContactosFilters.tsx`
Filtros: search, estado, pais, categoria, fecha creacion + toggle list/grid.

### 7. `src/pages/NuevoContacto.tsx`
Pagina wrapper con sidebar + topbar.

### 8. `src/pages/contactos/NuevoContactoForm.tsx`
Formulario con los campos del diseno de referencia:
- Nombre del Contacto * (input)
- Categoria Fisica * (select: A+, A, B+, B, C)
- Compania / Cuenta de Origen (select con mismas opciones: KASH Agency, alvaroletshoot, Blue app, Piclink.me, Pagomundo, Exchange, Unlok)
- Email (input)
- Telefono (select pais + input)
- Plataforma (select: Instagram, TikTok, Twitter/X, OnlyFans, Otra)
- Link de Instagram * (input con hint)
- Numero de Ticket (input)
- Notas (textarea)
- Foto de Perfil (upload con avatar preview)
- Fotos y Videos Extras (upload multiple)
- Footer: Cancelar + Guardar Contacto (boton primario)

Breadcrumb: Contactos > Nuevo Contacto
Boton "Volver" con flecha

## Archivos a modificar

### 9. `src/components/dashboard/DashboardSidebar.tsx`
- Agregar `{ title: "Contactos", url: "/contactos", icon: UserPlus }` en mainMenu ANTES de Creadores (posicion index 1, entre Dashboard y Creadores)
- Importar `UserPlus` de lucide-react

### 10. `src/App.tsx`
- Importar Contactos y NuevoContacto
- Agregar rutas:
  - `/contactos` -> Contactos
  - `/contactos/nuevo` -> NuevoContacto

## Patrones seguidos
- Layout: SidebarProvider + Sidebar + Topbar + Content (mismo que Creadores, LeadGen)
- Header fijo con shrink-0, contenido con flex-1 overflow-auto
- Tabla con scroll interno max-h calculado y sticky header
- KPI cards con hover scale 1.03 + gradiente (patron CreadoresKPICards)
- Badge variants del sistema de diseno existente
- Sorting en todas las columnas de la tabla
- Sin valores hardcoded de colores

