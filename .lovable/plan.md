

## Integrar Design System dentro del layout principal de la plataforma

### Problema
La pagina `/design-system` se renderiza sin el `SidebarProvider`, `DashboardSidebar` ni `DashboardTopbar`. Por eso no aparece ni el sidebar ni el topbar de la plataforma: el modulo esta "suelto", a diferencia de todas las demas paginas protegidas como `/dashboard`, `/creadores`, `/eventos`, etc.

### Solucion
Envolver el contenido del Design System con el mismo layout wrapper que usan las demas paginas.

### Cambio unico

**Archivo: `src/pages/DesignSystem.tsx`**

Aplicar el patron estandar de layout (igual que `Dashboard.tsx`, `Creadores.tsx`, etc.):

```
SidebarProvider
  div.flex.min-h-screen.w-full
    DashboardSidebar
    div.flex.flex-1.flex-col
      DashboardTopbar
      DesignSystemPage    <-- contenido actual sin cambios
  ClariAiFab
```

Esto hara que el sidebar y topbar de la plataforma aparezcan normalmente, y el contenido del Design System (con su header propio y tab bar horizontal) se renderice en el area de contenido principal, exactamente igual que cualquier otro modulo.

No se requiere ningun cambio en `DesignSystemPage.tsx` ya que su layout interno (`flex-1 flex flex-col h-full overflow-hidden`) esta disenado para encajar en el area de contenido.

### Archivo

| Archivo | Cambio |
|---------|--------|
| `src/pages/DesignSystem.tsx` | Envolver con SidebarProvider, DashboardSidebar, DashboardTopbar y ClariAiFab |
