

## Renombrar "Prospectos" a "Casting" y "Nuevo Prospecto" a "Nuevo Perfil"

Cambios de texto en dos archivos, sin modificar logica ni estructura.

---

### Archivo 1: `src/pages/creadores/prospectos/ProspectosPage.tsx`

- **Linea 119**: Titulo del header `"Prospectos"` -> `"Casting"`
- **Linea 120**: Descripcion `"Gestiona prospectos y conviértelos en creadoras"` -> `"Gestiona perfiles y conviértelos en creadoras"`
- **Linea 123**: Boton CTA `"Nuevo Prospecto"` -> `"Nuevo Perfil"`
- **Linea 136**: KPI label `"Total Prospectos"` -> `"Total Casting"`
- **Linea 200**: Mensaje vacio tabla `'No hay prospectos. Haz clic en "Nuevo Prospecto" para empezar.'` -> `'No hay perfiles. Haz clic en "Nuevo Perfil" para empezar.'`
- **Linea 264**: Mensaje vacio grid `"No hay prospectos registrados."` -> `"No hay perfiles registrados."`

Revisar tambien el titulo del modal "Nuevo Prospecto" (Dialog) y cambiarlo a "Nuevo Perfil".

### Archivo 2: `src/components/dashboard/DashboardSidebar.tsx`

- **Linea 42**: Sidebar submenu `"Prospectos"` -> `"Casting"`

---

Solo se cambian labels visibles. La ruta `/creadores/prospectos`, nombres de archivos, tabla `creator_prospects` y hook `useProspectos` se mantienen sin cambios.

