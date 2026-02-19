
## Renombrar "Dashboard" a "Listado" y crear un nuevo Dashboard de Creadoras

### Contexto actual
En el sidebar, el submenú de **Creadores** tiene dos ítems:
- `Dashboard` → `/creadores` (es el listado filtrable con tabla/grid)
- `Onboarding` → `/creadores/onboarding`

El ítem "Dashboard" es en realidad un **listado**, no un dashboard. Se propone:
1. Renombrarlo a "Listado" en el sidebar.
2. Actualizar el título `h1` de la página de `"Creadores"` a `"Listado de Creadoras"`.
3. Crear una nueva ruta `/creadores/dashboard` con una página de dashboard real.
4. Añadir ese nuevo ítem al submenú del sidebar.

---

### Estructura del nuevo Dashboard de Creadoras

La nueva página `/creadores/dashboard` mostrará una visión ejecutiva del sistema de gestión, con datos obtenidos de las tablas `creators` y `creator_business` que ya existen.

**Sección 1 — KPIs de Estado (fila superior)**
Cards con el mismo efecto hover premium del sistema, una por estado:

| Card | Dato | Color |
|---|---|---|
| Activas | `status = 'active'` | success |
| Onboarding | `status = 'onboarding'` | primary |
| Pausadas | `status = 'paused'` | warning |
| En retiro | `status = 'leaving'` | destructive |
| Terminadas | `status = 'terminated'` | muted |

**Sección 2 — Métricas de distribución (fila media)**
- **Por Agencia**: mini barras horizontales (KASH, alvaroletshoot, etc.) con conteo y % del total.
- **Por País**: top 5 países con más creadoras.
- **Por Categoría**: distribución de categorías (A+, A, B, etc.).

**Sección 3 — Actividad reciente (fila inferior)**
- **Últimas incorporaciones**: las 5 creadoras más recientemente registradas (`created_at` DESC), con nombre, agencia y estado.
- **Onboarding en curso**: creadoras con `status = 'onboarding'` más su fecha de inicio (`start_date` de `creator_business`).

---

### Archivos a crear / modificar

| Archivo | Acción | Descripción |
|---|---|---|
| `src/pages/creadores/CreadorasDashboardPage.tsx` | Crear | Página envolvente con Sidebar + Topbar |
| `src/pages/creadores/CreadorasDashboardContent.tsx` | Crear | Contenido real del dashboard con KPIs, distribución y actividad |
| `src/components/dashboard/DashboardSidebar.tsx` | Modificar | Renombrar `"Dashboard"` → `"Listado"` en `creadoresSubItems` y añadir `{ title: "Dashboard", url: "/creadores/dashboard" }` |
| `src/pages/creadores/CreadoresContent.tsx` | Modificar | Cambiar el `h1` de `"Creadores"` a `"Listado de Creadoras"` |
| `src/App.tsx` | Modificar | Añadir ruta `<Route path="/creadores/dashboard" element={<ProtectedRoute><CreadorasDashboardPage /></ProtectedRoute>} />` |

---

### Detalle técnico

El `CreadorasDashboardContent.tsx` reutilizará el hook `useCreadores` ya existente (sin filtros) para obtener todos los datos sin llamadas extra a Supabase. Los cálculos de distribución por agencia, país y categoría se hacen en el cliente con los datos del array.

El orden del submenú de Creadores quedará:
```
Creadores ▾
  ├─ Dashboard   → /creadores/dashboard   (NUEVA)
  ├─ Listado     → /creadores             (renombrada)
  └─ Onboarding  → /creadores/onboarding
```
