

## Crear pagina de Onboarding en /creadores/onboarding

### Descripcion

Crear una pagina completa de Onboarding que replica 1:1 el diseno de la imagen de referencia. La pagina mostrara los creadores con status "onboarding" de la base de datos, con KPI cards, tabs por area, buscador, vista tabla/grid y una tabla detallada con columnas de progreso y estado.

### Estructura visual (de arriba a abajo)

1. **Breadcrumbs**: Creadores > Onboarding
2. **Header**: Titulo "Onboarding" + subtitulo + boton "+ Iniciar Onboarding"
3. **4 KPI Cards**: Total Onboarding, Pendientes, En Progreso, Completados
4. **Tabs de area**: Todos, Ventas, LeadGen, Contenido, Marketing, Tecnologia
5. **Barra de filtros**: Buscador + toggle vista tabla/grid
6. **Tabla**: Columnas Empleado, Posicion, Area, Empresa, Fecha Inicio, Manager, Progreso (barra), Estado (badge)

### Datos

Se usaran los creadores con `status = 'onboarding'` de la tabla `creators`, unido con `creator_business` para la agencia y fecha de inicio, y `creator_training` para calcular el progreso. El progreso se calculara basado en los campos completados del training (script_status, call_completed_date, first_content_date, autonomous_since_date).

### Seccion tecnica

**Archivos a crear:**

**1. `src/pages/creadores/onboarding/OnboardingContent.tsx`** - Componente principal

Layout siguiendo el patron estandar (`flex-1 flex flex-col h-full overflow-hidden min-w-0`):
- Header con breadcrumbs (`Breadcrumb` de shadcn), titulo, subtitulo y boton
- 4 KPI cards en grid `grid-cols-4` con los conteos dinamicos
  - Total Onboarding (color default)
  - Pendientes (color `text-amber-500`)
  - En Progreso (color `text-blue-500`)
  - Completados (color `text-success`)
- Tabs de area usando el patron inline-flex con Button secondary/ghost
- Barra de filtros: Input con icono Search + toggles List/LayoutGrid
- Renderizado condicional tabla/grid

**2. `src/pages/creadores/onboarding/OnboardingTable.tsx`** - Tabla

Tabla con sticky header, columnas:
- **Empleado**: Avatar con iniciales + nombre completo
- **Posicion**: texto (derivado de `kash_type` o "Otro")
- **Area**: Badge morado con texto (derivado de `manager_type` o "Otro")
- **Empresa**: texto de `assigned_agency`
- **Fecha Inicio**: `start_date` formateado
- **Manager**: nombre del manager asignado o "Sin asignar"
- **Progreso**: barra `Progress` + porcentaje numerico
- **Estado**: Badge con icono (Completado=verde con check, Pendiente=gris con reloj, En Progreso=azul)

**3. `src/pages/creadores/onboarding/OnboardingGrid.tsx`** - Vista grid

Cards con la info resumida de cada creador en onboarding.

**4. `src/pages/creadores/onboarding/useOnboarding.ts`** - Hook de datos

Query a Supabase:
```ts
supabase
  .from("creators")
  .select("*, creator_business(*), creator_training(*)")
  .eq("status", "onboarding")
```

Calculo de progreso basado en campos completados de `creator_training` (4 hitos: script_status completado, call_completed, first_content, autonomous_since). Cada hito completado = 25%.

Estado derivado: 0% = Pendiente, 1-99% = En Progreso, 100% = Completado.

**5. `src/pages/creadores/onboarding/OnboardingPage.tsx`** - Wrapper con Dashboard layout

Siguiendo el patron de otras paginas (importa `DashboardSidebar`, `DashboardTopbar`, etc.)

**Archivos a modificar:**

**6. `src/App.tsx`** - Agregar ruta

```tsx
import OnboardingPage from "./pages/creadores/onboarding/OnboardingPage";
// ...
<Route path="/creadores/onboarding" element={<ProtectedRoute><OnboardingPage /></ProtectedRoute>} />
```

La ruta debe ir ANTES de `/creadores/:id` para evitar conflictos.

