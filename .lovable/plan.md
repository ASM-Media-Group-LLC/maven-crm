
## Estandarización de botones principales en headers de sección

### Regla establecida en el Design System

Según la memoria del proyecto (`style/contextual-button-usage`):
> **Acciones principales en el header de página** (ej. "Agregar Creador", "Nuevo Ticket"): variante **`outline`**

### Discrepancias encontradas

Al revisar todos los archivos `*Content.tsx` de la app:

| Archivo | Botón | Variante actual | Variante correcta |
|---|---|---|---|
| `ContactosContent.tsx` | "Agregar Contacto" | `default` (sin variant) | `outline` |
| `ContactosContent.tsx` | "Agregar Agencia" | `default` (sin variant) | `outline` |
| `OnboardingContent.tsx` | "Iniciar Onboarding" | `default` (sin variant) | `outline` |
| `LeadGenContent.tsx` | "Lead" | `outline` ✅ | ya correcto |
| `LeadGenContent.tsx` | "Contacto" | `outline` ✅ | ya correcto |
| `CreadoresContent.tsx` | "Agregar Creador" | `outline` ✅ | ya correcto |
| `TicketsContent.tsx` | "Nuevo Ticket" | `outline` ✅ | ya correcto |
| `EventosContent.tsx` | "Crear Evento" | `outline` ✅ | ya correcto |
| `TareasContent.tsx` | "Nueva Tarea" | `outline` ✅ | ya correcto |
| `ProjectsListContent.tsx` | "Nuevo Proyecto" | `outline` ✅ | ya correcto |
| `ClosersContent.tsx` | "Nuevo Deal" | `outline` ✅ | ya correcto |

### Cambios a realizar (solo 2 archivos)

**`src/pages/contactos/ContactosContent.tsx`** — líneas 122 y 127:
```tsx
// Antes
<Button onClick={() => navigate("/contactos/nuevo")}>
<Button onClick={() => setAddAgenciaOpen(true)}>

// Después
<Button variant="outline" onClick={() => navigate("/contactos/nuevo")}>
<Button variant="outline" onClick={() => setAddAgenciaOpen(true)}>
```

**`src/pages/creadores/onboarding/OnboardingContent.tsx`** — línea 62:
```tsx
// Antes
<Button onClick={() => setShowWizard(true)}>

// Después
<Button variant="outline" onClick={() => setShowWizard(true)}>
```

### Archivos a modificar

| Archivo | Cantidad de cambios |
|---|---|
| `src/pages/contactos/ContactosContent.tsx` | 2 botones |
| `src/pages/creadores/onboarding/OnboardingContent.tsx` | 1 botón |
