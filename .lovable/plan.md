

## Plan: Reordenar sidebar y mostrar todas las agencias en Casting

### Cambios

#### 1. `src/components/dashboard/DashboardSidebar.tsx` — Reordenar sub-items

Mover "Casting" antes de "Listado" para seguir el flujo logico del embudo:

```
Dashboard → Casting → Listado → Onboarding
```

#### 2. `src/pages/creadores/prospectos/ProspectosPage.tsx` — Mostrar todas las agencias

Actualmente la linea 86 filtra las agencias solo si tienen datos:
```js
const agencyTabs = AGENCY_ORDER.filter((a) => prospects.some((p) => p.agency === a));
```

Cambiar para mostrar todas las agencias de `AGENCY_ORDER` siempre, independientemente de si tienen registros, permitiendo filtrado exhaustivo (consistente con el patron de la plataforma).

### Archivos

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/DashboardSidebar.tsx` | Reordenar: Casting antes de Listado |
| `src/pages/creadores/prospectos/ProspectosPage.tsx` | Mostrar todas las agencias en el tab bar |

