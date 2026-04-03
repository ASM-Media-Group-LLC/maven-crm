
## Rediseño Dashboard2 — Executive Intelligence View

### 1. Header Compacto
- Título + selector de mes en línea, botones como icon-only con tooltips (PDF, 80/20, Alertas, Proyección, Métricas)
- Eliminar texto redundante ("Período: X → Y") — ya está en el selector

### 2. Executive KPI Strip (siempre visible, reemplaza las 4 cards actuales)
Fila compacta de métricas clave con micro-sparklines:
- **Revenue Bruto** + Net + % cambio vs mes anterior
- **Creadoras Activas** + inactivas como badge
- **ARPC** (Avg Revenue Per Creator) 
- **$/Fan** promedio global
- **Tasa de Retención** (renewal rate)
- **Revenue Mix** mini-bars (Msgs/Tips/Subs %)

### 3. Strategic Insights Panel (nuevo, debajo de KPIs)
Grid de 3 columnas con métricas McKinsey:
- **Concentración de Revenue**: "Top X creadoras generan 80% del ingreso" con mini progress bar
- **Velocidad de Crecimiento**: Creators creciendo vs cayendo (count + %)
- **Eficiencia de Monetización**: $/Fan trend, msg conversion implied

### 4. Placeholders Futuros (con estado "Coming Soon")
Cards con borde punteado y icono dimmed:
- **Chatter Performance**: "Revenue por chatter, msgs/hora, conversion rate" — placeholder
- **Customer LTV**: "Lifetime value, churn rate, reactivation %" — placeholder  
- **Content ROI**: "Revenue por tipo de contenido, engagement rate" — placeholder
- **Cohort Analysis**: "Retención por cohorte de fans" — placeholder

### 5. Filtros + Tabla
- Toolbar de filtros más compacto (inline, sin border card)
- Eliminar banner de info (moverlo a tooltip del título)
- Tabla sin cambios funcionales

### Archivos
| Archivo | Acción |
|---------|--------|
| `src/pages/Dashboard2.tsx` | Refactor completo del layout |
