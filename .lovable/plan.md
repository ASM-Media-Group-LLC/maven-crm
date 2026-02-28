

## Reorganizar sidebar de Creadores

### Cambios

Se modificara unicamente el archivo `src/components/dashboard/DashboardSidebar.tsx`.

### 1. Reordenar los sub-items de Creadores

El orden actual es: Dashboard, Casting, Listado, Onboarding.
El nuevo orden sera:

1. Dashboard (`/creadores/dashboard`)
2. Casting (`/creadores/prospectos`)
3. Onboarding (`/creadores/onboarding`)
4. Listado (`/creadores`)
5. **Personalizados** (nueva sub-seccion colapsable)

### 2. Crear sub-seccion "Personalizados"

Dentro del menu colapsable de Creadores, despues de "Listado", se agregara un separador visual y un grupo anidado llamado "Personalizados" que contendra:

- Whaticket (`/whaticket`)

### Detalles tecnicos

- En `creadoresSubItems` (linea 43-48), se reordenaran los items: Dashboard, Casting, Onboarding, Listado.
- Se creara un array `creadoresPersonalizados` con el item `{ title: "Whaticket", url: "/whaticket" }`.
- Se actualizara `isCreadoresActive` para incluir las rutas de personalizados.
- En el JSX del Collapsible de Creadores, despues de renderizar los sub-items principales, se agregara un pequeno separador y los items de "Personalizados" como un sub-grupo con label.
- El mismo patron se aplicara al DropdownMenu de la vista colapsada del sidebar.

