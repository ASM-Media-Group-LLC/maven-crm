
## Problema: Sidebar y Topbar ausentes en todas las páginas internas de HR

### Causa Raíz

Cada página HR (`HRDashboard`, `EmployeeDirectory`, `EmployeeNew`, `EmployeeProfile`, `HRAbsences`, `HRIncidents`, `HRApplicants`, `HRTraining`, `HRPerformance`) devuelve únicamente su contenido propio — un `<div className="p-6 ...">` — **sin el shell de layout** (`SidebarProvider + DashboardSidebar + DashboardTopbar`).

El patrón correcto, como en `Tickets.tsx` y `OnboardingPage.tsx`, es envolver el contenido en:

```
<SidebarProvider>
  <div className="flex h-screen w-full overflow-hidden">
    <DashboardSidebar />
    <div className="flex flex-1 flex-col min-w-0">
      <DashboardTopbar />
      <contenido-de-la-página />
    </div>
  </div>
</SidebarProvider>
```

Ninguna de las 9 páginas HR tiene este wrapper, por eso el sidebar y el topbar desaparecen al navegar a cualquier ruta `/hr/*`.

---

### Solución: Crear un HRLayout compartido

En lugar de repetir el mismo boilerplate en las 9 páginas, se crea **un único componente de layout** `src/pages/hr/HRLayout.tsx` que actúa como shell reutilizable:

```tsx
// src/pages/hr/HRLayout.tsx
const HRLayout = ({ children }) => (
  <SidebarProvider>
    <div className="flex h-screen w-full overflow-hidden">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <DashboardTopbar />
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  </SidebarProvider>
);
```

---

### Archivos a crear/modificar

| Archivo | Cambio |
|---|---|
| `src/pages/hr/HRLayout.tsx` | **Nuevo** — shell de layout compartido para todo el módulo HR |
| `src/App.tsx` | Envolver las 9 rutas HR con `<HRLayout>` dentro de `<ProtectedRoute>` |

Las 9 rutas afectadas:
- `/hr` → `HRDashboard`
- `/hr/directorio` → `EmployeeDirectory`
- `/hr/empleado/nuevo` → `EmployeeNew`
- `/hr/empleado/:id` → `EmployeeProfile`
- `/hr/ausencias` → `HRAbsences`
- `/hr/incidentes` → `HRIncidents`
- `/hr/candidatos` → `HRApplicants`
- `/hr/capacitacion` → `HRTraining`
- `/hr/desempeno` → `HRPerformance`

**Nota:** Los archivos de contenido HR (`HRDashboard.tsx`, `EmployeeDirectory.tsx`, etc.) **no se modifican** — solo se envuelven desde `App.tsx`. Esto es más limpio y sigue exactamente el mismo patrón de otras páginas como `Tickets.tsx` (que tiene su propio wrapper) pero centralizado en un solo lugar.

---

### Sin cambios a las páginas HR individuales

Las páginas internas ya están correctamente construidas como componentes de contenido puro. Solo faltaba el shell de layout. Este enfoque minimiza el riesgo de introducir errores.
