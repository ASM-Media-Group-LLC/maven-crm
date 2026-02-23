

## Separar el Wizard de Onboarding en su propia pagina

### Objetivo

Mover el formulario de onboarding (wizard) de un estado inline dentro de `/creadores/onboarding` a una pagina dedicada con su propia ruta, navegacion y estructura.

### Cambios planificados

#### 1. Nueva ruta: `/creadores/onboarding/nuevo` y `/creadores/onboarding/:id`

- `/creadores/onboarding/nuevo` -- Iniciar un onboarding nuevo (sin `editCreatorId`)
- `/creadores/onboarding/:id` -- Continuar/editar el onboarding de un creador existente (con `editCreatorId` y `initialStep` calculado)

#### 2. Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | Agregar las dos nuevas rutas protegidas |
| `src/pages/creadores/onboarding/OnboardingWizardPage.tsx` | **Nuevo archivo** -- Pagina completa con layout (Sidebar + Topbar), breadcrumbs (Creadores > Onboarding > Nuevo/Editar) y el componente `OnboardingWizard`. Usa `useParams` para obtener el `id` y `useNavigate` para el boton cancelar |
| `src/pages/creadores/onboarding/OnboardingContent.tsx` | Eliminar el estado `showWizard`/`editingCreator` y la renderizacion condicional del wizard. El boton "Iniciar Onboarding" ahora navega a `/creadores/onboarding/nuevo`. El click en una fila/tarjeta navega a `/creadores/onboarding/:id` |
| `src/pages/creadores/onboarding/OnboardingWizard.tsx` | Cambiar la prop `onCancel` para que acepte navegacion (el componente padre pasara `navigate(-1)` o `navigate("/creadores/onboarding")`) |

#### 3. Estructura de la nueva pagina

La pagina `OnboardingWizardPage` seguira el patron estandar del proyecto:

- Layout: `SidebarProvider` + `DashboardSidebar` + `DashboardTopbar`
- Header con boton ArrowLeft (ghost) para volver a `/creadores/onboarding`
- Breadcrumbs: Creadores > Onboarding > Nuevo Onboarding (o nombre del creador si es edicion)
- El wizard ocupa todo el area de contenido con scroll independiente

#### 4. Navegacion desde la lista

- Boton "Iniciar Onboarding": `navigate("/creadores/onboarding/nuevo")`
- Click en fila/tarjeta de creador: `navigate(\`/creadores/onboarding/${creator.id}\`)`
- Boton cancelar del wizard: `navigate("/creadores/onboarding")`
- Al completar el wizard exitosamente: `navigate("/creadores/onboarding")` con toast de confirmacion

### Detalle tecnico

No se requieren cambios en base de datos ni nuevas dependencias. Solo es reestructuracion de UI y rutas.

