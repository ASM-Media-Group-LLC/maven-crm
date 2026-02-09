
# Pagina de Creadores (/creadores)

## Resumen
Crear una pagina completa de gestion de creadores conectada a la base de datos de Supabase, reutilizando el layout existente del Dashboard (Sidebar + Topbar). La pagina incluye KPI cards con conteos reales por estado, filtros avanzados (agencia tabs, buscador, selectores), tabla de creadores con datos reales, y un modal para agregar nuevos creadores.

## Arquitectura de Archivos

Nuevos archivos a crear:
- `src/pages/Creadores.tsx` -- Pagina principal con layout (reutiliza SidebarProvider + DashboardSidebar + DashboardTopbar)
- `src/pages/creadores/CreadoresContent.tsx` -- Contenido principal: header, KPIs, filtros, tabla
- `src/pages/creadores/CreadoresKPICards.tsx` -- 5 tarjetas de KPI + total
- `src/pages/creadores/CreadoresFilters.tsx` -- Tabs de agencia, buscador, selectores, switch de vista
- `src/pages/creadores/CreadoresTable.tsx` -- Tabla de creadores con sorting
- `src/pages/creadores/CreadoresGrid.tsx` -- Vista de cuadricula (cards)
- `src/pages/creadores/AddCreadorModal.tsx` -- Dialog/modal para agregar creador
- `src/pages/creadores/useCreadores.ts` -- Hook para fetch de datos con react-query + filtros

Archivos a modificar:
- `src/App.tsx` -- Agregar ruta `/creadores`
- `src/components/dashboard/DashboardSidebar.tsx` -- Agregar item "Creadores" al menu

## Detalle por Componente

### 1. `useCreadores.ts` -- Hook de datos
- Usa `@tanstack/react-query` para fetch de `creators` JOIN `creator_business` (para obtener `assigned_agency`)
- Query: `supabase.from("creators").select("*, creator_business(assigned_agency)")` 
- Retorna: `creators`, `isLoading`, `statusCounts` (computed), `uniqueAgencies`, `uniqueCategories`, `uniqueCountries`, `uniqueCities`
- Los filtros se aplican client-side sobre los datos cargados (la tabla tiene ~259 registros, manejable)

### 2. `CreadoresKPICards.tsx` -- KPI Cards
5 tarjetas + 1 total, mapeando estados de la DB:
| Card | Status DB | Color | Icono |
|------|-----------|-------|-------|
| Activas | `active` | success | TrendingUp |
| Onboarding | `onboarding` | primary | UserPlus |
| Pausadas | `paused` | warning | Pause |
| Retiros | `leaving` | destructive | UserMinus |
| Terminadas | `terminated` | muted | UserX |
| Total | (todos) | secondary | Users |

Cada card usa el componente `Card` existente con icono en esquina superior derecha, numero grande con color de acento, y subtitulo descriptivo. Los conteos se calculan del array filtrado.

### 3. `CreadoresFilters.tsx` -- Sistema de Filtros
- **Tabs de agencia**: Usando el componente `Tabs` existente con valores: Todas, Atomic Agency, Kash Agency, Unlok Platform, Otra, Elite Models
- **Buscador**: `Input` con icono `Search`, filtra por `name` o `artistic_name`
- **Selectores**: 4 `Select` para Estado, Categoria, Pais, Ciudad (con opcion "Todos")
- **Switch de vista**: Dos botones con iconos `List` y `LayoutGrid` para alternar tabla/cuadricula
- Todos los filtros son client-side con estado local en `CreadoresContent`

### 4. `CreadoresTable.tsx` -- Tabla de Creadores
Columnas (todas con sorting):
| Columna | Datos | Formato |
|---------|-------|---------|
| Creador | Avatar + name/artistic_name | Avatar con iniciales + texto |
| Categoria | category | Badge secondary-soft |
| Estado | status | Badge con color segun estado |
| Ubicacion | city, country | Texto |
| Agencia | creator_business.assigned_agency | Texto |
| Redes | instagram/tiktok/twitter handles | Iconos clicables |
| Acciones | menu | DropdownMenu con opciones |

Badges de estado:
- active -> success-soft
- onboarding -> primary-soft  
- leaving -> destructive-soft
- terminated -> secondary-soft
- paused -> warning-soft

### 5. `CreadoresGrid.tsx` -- Vista Cuadricula
Cards individuales mostrando avatar, nombre, categoria badge, estado badge, ubicacion y redes sociales. Grid responsivo: 1 col mobile, 2 col tablet, 3-4 col desktop.

### 6. `AddCreadorModal.tsx` -- Modal de Creacion
- Usa `Dialog` existente
- Formulario con campos: nombre (requerido), artistic_name, email, phone, category (select), country, city, status (default "onboarding"), instagram_handle, onlyfans_url
- Submit: `supabase.from("creators").insert(...)` 
- Al exito: invalidar query de react-query y cerrar modal
- Validacion con react-hook-form + zod

### 7. Modificaciones existentes

**App.tsx**: Agregar `<Route path="/creadores" element={<Creadores />} />`

**DashboardSidebar.tsx**: Agregar al `mainMenu`:
```typescript
const mainMenu = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Creadores", url: "/creadores", icon: Users },
];
```

### 8. `Creadores.tsx` -- Pagina wrapper
Reutiliza exactamente el mismo layout del Dashboard:
```typescript
<SidebarProvider>
  <div className="flex min-h-screen w-full">
    <DashboardSidebar />
    <div className="flex flex-1 flex-col">
      <DashboardTopbar />
      <CreadoresContent />
    </div>
  </div>
</SidebarProvider>
```

## Notas Tecnicas
- No se necesitan migraciones de DB: se usan las tablas `creators` y `creator_business` existentes
- No hay RLS activo en estas tablas, por lo que los datos son accesibles con la clave anon
- Se respeta el constraint de design system: solo tokens existentes, sin valores hardcodeados
- Sorting habilitado en todas las columnas de la tabla (constraint del design system)
- El estado "paused" no existe actualmente en la DB (0 registros), pero se incluye la card por completitud
