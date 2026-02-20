
## Estandarización: botón `default` (primary) para la acción principal de cada sección

### La regla corregida

El botón `default` (gradiente azul-morado) es el CTA principal de la plataforma. Debe usarse para **la acción de creación primaria en cada header de sección**. Las acciones secundarias (compartir, exportar, acción adicional) van en `outline`.

---

### Mapa completo de cambios por sección

| Sección | Botón principal → `default` | Botón secundario → `outline` (ya correcto o ajustar) |
|---|---|---|
| **Creadores** | "Agregar Creador" | — |
| **Contactos** | "Agregar Contacto" | "Agregar Agencia" (secundario, queda `outline`) |
| **Eventos** | "Crear Evento" | "Compartir Agenda" (secundario, queda `outline`) |
| **Tickets** | "Nuevo Ticket" | — |
| **Tareas (Proyectos)** | "Nuevo Proyecto" | — |
| **Tareas (dentro de proyecto)** | "Nueva Tarea" | — |
| **Onboarding** | "Iniciar Onboarding" | — |
| **LeadGen** | "Agregar Lead" (texto completo) | "Agregar Contacto" (queda `outline`) |
| **Closers** | "Nuevo Deal" | — |

### Detalles técnicos por archivo

**`src/pages/creadores/CreadoresContent.tsx`** (línea 43):
```tsx
// Antes
<Button variant="outline" onClick={() => navigate("/creadores/nuevo")}>
// Después
<Button onClick={() => navigate("/creadores/nuevo")}>
```

**`src/pages/contactos/ContactosContent.tsx`** (línea 122):
```tsx
// Antes
<Button variant="outline" onClick={() => navigate("/contactos/nuevo")}>
// Después
<Button onClick={() => navigate("/contactos/nuevo")}>
// "Agregar Agencia" permanece outline (acción secundaria)
```

**`src/pages/eventos/EventosContent.tsx`** (línea 103):
```tsx
// Antes
<Button variant="outline" onClick={() => navigate("/eventos/nuevo")}>
// Después
<Button onClick={() => navigate("/eventos/nuevo")}>
// "Compartir Agenda" permanece outline
```

**`src/pages/tickets/TicketsContent.tsx`** (línea 83):
```tsx
// Antes
<Button variant="outline" onClick={() => setModalOpen(true)}>
// Después
<Button onClick={() => setModalOpen(true)}>
```

**`src/pages/tareas/ProjectsListContent.tsx`** (línea 152):
```tsx
// Antes
<Button variant="outline" onClick={() => setCreateOpen(true)}>
// Después
<Button onClick={() => setCreateOpen(true)}>
```

**`src/pages/tareas/TareasContent.tsx`** (línea 129):
```tsx
// Antes
<Button variant="outline" onClick={() => setCreateOpen(true)}>
// Después
<Button onClick={() => setCreateOpen(true)}>
```

**`src/pages/creadores/onboarding/OnboardingContent.tsx`** (línea 62):
```tsx
// Antes
<Button variant="outline" onClick={() => setShowWizard(true)}>
// Después
<Button onClick={() => setShowWizard(true)}>
```

**`src/pages/leadgen/LeadGenContent.tsx`** (líneas 121-128):
```tsx
// Antes - texto corto "Lead" en outline
<Button variant="outline" size="sm" onClick={() => setAddLeadOpen(true)}>
  <Plus className="h-4 w-4" />
  Lead
</Button>
<Button variant="outline" size="sm" onClick={() => setAddContactoOpen(true)}>
  <UserPlus className="h-4 w-4" />
  Contacto
</Button>

// Después - "Agregar Lead" como default (primary), "Agregar Contacto" outline
<Button size="sm" onClick={() => setAddLeadOpen(true)}>
  <Plus className="h-4 w-4" />
  Agregar Lead
</Button>
<Button variant="outline" size="sm" onClick={() => setAddContactoOpen(true)}>
  <UserPlus className="h-4 w-4" />
  Agregar Contacto
</Button>
```

**`src/pages/closers/ClosersContent.tsx`** (línea 43):
```tsx
// Antes
<Button variant="outline" onClick={() => setShowNewDeal(true)}>
// Después
<Button onClick={() => setShowNewDeal(true)}>
```

### Archivos a modificar (9 archivos)

1. `src/pages/creadores/CreadoresContent.tsx`
2. `src/pages/contactos/ContactosContent.tsx`
3. `src/pages/eventos/EventosContent.tsx`
4. `src/pages/tickets/TicketsContent.tsx`
5. `src/pages/tareas/ProjectsListContent.tsx`
6. `src/pages/tareas/TareasContent.tsx`
7. `src/pages/creadores/onboarding/OnboardingContent.tsx`
8. `src/pages/leadgen/LeadGenContent.tsx`
9. `src/pages/closers/ClosersContent.tsx`

### Actualización de la regla en el design system

Se actualizará la memoria `style/contextual-button-usage-v2` para reflejar:
- Acción **principal** de header de sección → variante `default` (gradiente primary)
- Acciones **secundarias** de header → variante `outline`
