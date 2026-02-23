

## Limpieza del Dashboard de Creadores

### Cambio unico

**Archivo**: `src/pages/creadores/CreadorasDashboardContent.tsx`

**Eliminar**: La Card "Onboarding en Curso" (lineas 278-316) que muestra la lista de nombres con fechas de inicio.

**Mantener intacto**:
- La KPI card de "Onboarding" en la seccion superior (linea 15) que muestra el conteo total
- El calculo `statusCounts` que alimenta esa KPI
- La Card de "Ultimas Incorporaciones" a la izquierda

**Ajuste de layout**: La seccion 3 (linea 240) actualmente usa un grid de 2 columnas (`grid-cols-1 md:grid-cols-2`). Al quedar solo "Ultimas Incorporaciones", se cambia a una sola columna para que la card ocupe todo el ancho disponible sin dejar un hueco vacio.

### Codigo a limpiar

Se eliminan tambien las variables y imports que quedan sin uso:
- `onboardingCreators` (useMemo, linea 76-79)
- Import de `Calendar` de lucide-react (linea 3) -- ya no se usa
- Import de `Clock` solo se mantiene si se usa en otro lugar (se usa en statusConfig, asi que se mantiene)

### Resultado visual

El dashboard queda con:
1. Header con titulo y subtitulo
2. 5 KPI cards de estado (incluyendo Onboarding con su conteo)
3. 3 cards de distribucion (Agencia, Paises, Categorias)
4. 1 card de Ultimas Incorporaciones a ancho completo

