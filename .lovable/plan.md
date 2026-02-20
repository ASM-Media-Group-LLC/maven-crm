
## Breadcrumb y navegación de vuelta en AiSalesConfig

### Diagnóstico

La página `/ai-sales-config` actualmente no tiene ningún mecanismo para volver a `/aisales`. El header solo muestra el título "Configuración AI Sales" como si fuera una sección de primer nivel, cuando en realidad es una sub-página dependiente de "IA Ventas".

Revisando el sistema, hay dos patrones de navegación de retorno usados en la plataforma:

- **Breadcrumb** (Onboarding → Creadores): para páginas de configuración o sub-secciones funcionales. Usa `BreadcrumbLink + BreadcrumbSeparator + BreadcrumbPage`.
- **Botón ArrowLeft en header** (Evento Detail, Tareas dentro de proyecto): para vistas de detalle de un registro específico.

Para `AiSalesConfig`, el patrón correcto es el **Breadcrumb**, igual que Onboarding, ya que es una página de configuración de una sección (no un detalle de registro).

---

### Cambio único: `src/pages/AiSalesConfig.tsx`

**Imports a añadir:**
- `Link` desde `react-router-dom`
- `Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator` desde `@/components/ui/breadcrumb`

**Antes** — el header solo tiene título + acciones:
```tsx
<header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold">Configuración AI Sales</h1>
      <p className="text-sm text-muted-foreground">Ajusta cómo responde el asistente de ventas</p>
    </div>
    <div className="flex items-center gap-3">
      <Badge variant="secondary-soft">Local</Badge>
      <Button variant="outline" onClick={handleSave}>...
```

**Después** — se añade el breadcrumb encima del título, siguiendo exactamente el patrón de OnboardingContent:
```tsx
<header className="bg-background px-6 pt-6 pb-4 border-b border-border shrink-0">
  {/* Breadcrumb de navegación */}
  <Breadcrumb className="mb-3">
    <BreadcrumbList>
      <BreadcrumbItem>
        <BreadcrumbLink asChild>
          <Link to="/aisales">IA Ventas</Link>
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator />
      <BreadcrumbItem>
        <BreadcrumbPage>Configuración</BreadcrumbPage>
      </BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>

  <div className="flex items-center justify-between">
    <div>
      <h1 className="text-2xl font-bold">Configuración AI Sales</h1>
      <p className="text-sm text-muted-foreground">Ajusta cómo responde el asistente de ventas</p>
    </div>
    <div className="flex items-center gap-3">
      <Badge variant="secondary-soft">Local</Badge>
      <Button variant="outline" onClick={handleSave}>...
```

---

### ¿Los breadcrumbs están bien en el resto de la plataforma?

Revisando el codebase completo, los breadcrumbs solo existen actualmente en **un único lugar**: `OnboardingContent.tsx` (Creadores → Onboarding). El resto de páginas de sub-nivel (Evento Detail, Tareas en proyecto, Perfil de creadora) usan el botón `ArrowLeft` en el header, que también es correcto.

No hay breadcrumbs rotos ni con rutas incorrectas. El único problema real es la ausencia de navegación de retorno en `AiSalesConfig`.

---

### Archivo a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/AiSalesConfig.tsx` | Añadir breadcrumb "IA Ventas → Configuración" encima del título en el header |
