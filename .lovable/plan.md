

## Renombrar "Lista" a "Dashboard" en el submenu de Creadores

### Cambio

En `src/components/dashboard/DashboardSidebar.tsx`, linea 38, cambiar el titulo del primer sub-item de Creadores de "Lista" a "Dashboard".

### Seccion tecnica

**Archivo:** `src/components/dashboard/DashboardSidebar.tsx` (linea 38)

Cambiar:
```ts
{ title: "Lista", url: "/creadores" },
```
Por:
```ts
{ title: "Dashboard", url: "/creadores" },
```

Un solo cambio de string sin impacto en rutas ni logica.

