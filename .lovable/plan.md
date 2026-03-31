

## Plan: Agregar Analytics a SuperContacts

### Qué se va a construir
Un botón "Analytics" en la página de SuperContacts que abre un modal con múltiples pestañas de análisis visual, similar al que ya existe en Contactos (`ContactosAnalyticsModal`).

### Pestañas de analytics

1. **Por Mes** — Barras de contactos registrados por mes + línea acumulativa. KPIs arriba: total, promedio mensual, mejor mes.

2. **Por Estado** — Barras horizontales mostrando distribución por status (nuevo, contactado, interesado, no_interesado, convertido) con conteo y porcentaje.

3. **Por País** — Barras con bandera + código ISO, ordenadas por cantidad.

4. **Por Ciudad** — Barras horizontales de ciudades más frecuentes (top 15). Si no hay datos → "Sin datos de ciudad".

5. **Por Categoría** — Distribución por el campo `category` de cada contacto.

6. **Enrichment** — Porcentaje de contactos enriquecidos vs no enriquecidos (campo `enriched`), con barra de progreso visual.

### Cambios

**Archivo nuevo: `src/pages/supercontacts/SuperContactsAnalyticsModal.tsx`**
- Modal con `Dialog` + `Tabs` + `Recharts` (mismo patrón que `ContactosAnalyticsModal`)
- Query a `super_contacts` trayendo: `created_at, status, country, city, category, enriched, followers_count`
- Cada pestaña calcula sus datos con `useMemo`
- Colores consistentes con la paleta COLORS del proyecto

**Archivo: `src/pages/SuperContacts.tsx`**
- Agregar botón "Analytics" (icono BarChart3) junto al dropdown de "Agregar Contacto"
- Estado `analyticsOpen` + renderizar `SuperContactsAnalyticsModal`

### Datos disponibles vs placeholder
Con los campos actuales de `super_contacts` (`status`, `country`, `city`, `category`, `enriched`, `followers_count`, `created_at`) se pueden llenar todas las pestañas. Si un campo está vacío en la DB, la pestaña mostrará "Sin datos" — conforme se agreguen contactos, las gráficas se poblarán automáticamente.

### Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `SuperContactsAnalyticsModal.tsx` (nuevo) | Modal con 6 pestañas de analytics |
| `SuperContacts.tsx` | Botón Analytics + estado del modal |

