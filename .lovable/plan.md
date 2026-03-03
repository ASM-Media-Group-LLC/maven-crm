

## Plan: Mover las Operational Cards debajo de las KPI Cards

Actualmente en `SalesOverview.tsx` el orden es:
1. `SalesKPICards` (5 KPIs arriba)
2. Gráficos (trend + channel)
3. `TopCreatorsTable`
4. `SalesOperationalCards` (Comparativas, Top 10, Bajando, etc.)

El usuario quiere que las operational cards (Comparativas, Top 10, Bajando, Alto Potencial, Alertas) queden inmediatamente debajo de las 5 KPI cards.

### Cambio en `src/pages/SalesOverview.tsx`

Mover `<SalesOperationalCards ... />` de la línea 106-110 a justo después de `<SalesKPICards ... />` (línea 100), antes del grid de gráficos. El orden final será:

1. `SalesKPICards`
2. `SalesOperationalCards`
3. Gráficos
4. `TopCreatorsTable`

Un solo cambio de posición de líneas, sin modificar props ni lógica.

