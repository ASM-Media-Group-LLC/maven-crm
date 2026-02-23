

## Eliminar la card "Onboardings en Curso"

### Archivo a modificar

**`src/pages/creadores/onboarding/OnboardingContent.tsx`**

### Cambio

Eliminar el bloque completo de la card "Onboardings en Curso" (lineas 101-140 aproximadamente), que incluye:
- El `Card` con su `CardHeader` que muestra el titulo "Onboardings en Curso" y el badge con el conteo
- El `CardContent` con el estado vacio y el grid de cards de onboardings en progreso

Se mantendran intactos los KPI cards (Total, Pendientes, En Progreso, Completados) y el resto del contenido de la pagina.

### Limpieza

- Revisar si las variables e imports que solo usaba esta card (como `inProgressCreators`, `RefreshCw`, `FolderOpen`) siguen siendo necesarios en otros lugares del componente. Si no, se eliminaran para mantener el codigo limpio.

