
## Mejora del selector de Compañía — Nuevo Contacto y Editar Contacto

### Problemas identificados

**1. Textos incorrectos en la lista actual**
Los nombres actuales no coinciden con los nombres oficiales que el usuario quiere:

| Actual | Correcto |
|---|---|
| `KASH Agency` | `Kash` |
| `alvaroletshoot` | `Alvaro Letshoot` |
| `Blue app` | `Blue App` |
| `Piclink.me` | `PicLink` |
| `Pagomundo` | `Pagomundo` (igual) |
| `Exchange` | `Exchange` (igual) |
| `Unlok` | `Unlok` (igual) |
| `Trafix` | `Trafix` (igual) |

**2. `EditContactoModal` tiene a `Trafix` ausente** — la lista de edición tiene 7 items, la de creación tiene 8. Deben estar sincronizadas.

**3. Sin opción para agregar nuevas compañías a futuro** — el usuario pide un mecanismo extensible.

---

### Solución: selector con opción "Agregar nueva"

Se reemplaza el `<Select>` simple por un componente enriquecido que combina **Popover + Command** (el mismo patrón searchable ya usado en LeadGen y Promolog para agentes/supervisores). Esto permite:

- Buscar/filtrar compañías mientras se escribe
- Mostrar un campo de texto inline al seleccionar "+ Agregar nueva compañía…"
- Guardar la nueva opción en el estado local de la sesión para usarla inmediatamente
- La nueva compañía queda guardada en el contacto al guardar el formulario

**Flujo visual:**

```text
┌──────────────────────────────┐
│ Kash                      ▼  │  ← Trigger del Popover
└──────────────────────────────┘
         ↓ al hacer clic
┌──────────────────────────────┐
│ 🔍 Buscar compañía...        │
├──────────────────────────────┤
│ ✓ Kash                       │  ← opción activa con checkmark
│   Alvaro Letshoot            │
│   Blue App                   │
│   PicLink                    │
│   Pagomundo                  │
│   Exchange                   │
│   Unlok                      │
│   Trafix                     │
├──────────────────────────────┤
│ + Agregar nueva compañía…    │  ← abre input inline
└──────────────────────────────┘
```

Al hacer clic en "+ Agregar nueva compañía…", el popover muestra un `Input` con botón "Agregar" para confirmar o `Esc` para cancelar. El nuevo nombre se añade al array local y se selecciona automáticamente.

---

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/contactos/NuevoContactoForm.tsx` | Corregir nombres en `COMPANIES`, reemplazar `<Select>` por componente Popover+Command con "Agregar nueva" |
| `src/pages/contactos/EditContactoModal.tsx` | Mismos cambios: nombres corregidos + Trafix añadido + mismo componente extensible |

---

### Implementación técnica

**Componente `CompanySelector`** — se define localmente en ambos archivos (o puede extraerse a un shared component si se requiere en más sitios):

```tsx
// Imports necesarios (ya disponibles en el proyecto):
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
```

El componente recibe `value`, `onChange` y maneja su propio estado de `open`, `search` y `addingNew` internamente. Los valores base se definen en la constante `DEFAULT_COMPANIES` para que ambas vistas los compartan conceptualmente.
