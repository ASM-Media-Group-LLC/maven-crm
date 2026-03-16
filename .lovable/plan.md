

## Plan: Tabla inline editable para Closers

### Problema actual
La tabla `LeadTable` es de solo lectura — para cambiar categoría, estado o contacto el usuario debe abrir un dropdown de acciones. Necesitas edición directa en celda (inline editing).

### Cambios

**Archivo: `src/pages/closers/components/LeadTable.tsx`**

1. **Columna "Categoría" (quality)** — Reemplazar el Badge estático por un `Select` inline que permita cambiar entre A+, A, B, C directamente en la celda.

2. **Columna "Contactada?"** — Actualmente muestra el estado como badge. Convertirla en un `Select` inline con opciones claras: "Sí" / "No" (mapeando a `contactado` / `no_response`).

3. **Columna "Estado"** — Agregar una nueva columna visible con un `Select` inline mostrando todos los estados posibles (Sin contactar, Contactado, Interesada, En negociación, Confirmada, Completada, No interesada). El usuario puede cambiar el estado directamente desde la celda.

4. **Columna "Notas"** — Hacer el campo clickeable para editar inline (input que aparece al hacer click, se guarda con Enter/blur).

**Archivo: `src/pages/closers/hooks/useCloserLeads.ts`**

5. Agregar mutation `updateField` genérica que permita actualizar cualquier campo individual (`quality`, `status`, `notes`, `phone_raw`) en `leadgen_entries`.

**Archivo: `src/pages/closers/ClosersContent.tsx`**

6. Pasar el nuevo `updateField` al `LeadTable` y conectar los callbacks de cada celda editable.

### Comportamiento UX
- Los selects inline se ven como badges/texto normal hasta que el usuario interactúa — al hacer click se abre el selector.
- El cambio se guarda inmediatamente al seleccionar una opción (no requiere botón de guardar).
- Las notas se editan con click → input aparece → Enter o blur para guardar.
- Se mantiene el menú de acciones (⋯) para acciones rápidas como "Avanzar estado".

