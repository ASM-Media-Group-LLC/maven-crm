

## Plan: Contacto existente — toast persistente + opción de actualizar

### Problema actual
1. El toast de "Contacto existente" desaparece muy rápido — el usuario no alcanza a leerlo
2. Cuando el contacto ya existe, no hay opción de actualizar sus datos (ej. agregar otro número)

### Cambios

**1. Reemplazar toast por diálogo modal cuando el contacto ya existe (`NuevoContactoForm.tsx`)**
- En lugar del toast efímero (línea 174), mostrar un diálogo/modal similar al de "Creadora existente" (línea 399) con:
  - Nombre del contacto existente, agente que lo registró, fecha
  - Teléfono actual del contacto (si tiene)
  - Dos opciones claras:
    - **"Actualizar contacto"** → abre flujo de actualización (actualiza el teléfono/email/notas del registro existente)
    - **"Crear nuevo registro"** → continúa con el flujo actual (crea registro nuevo)
    - **"Cancelar"** → cierra el diálogo
- Se necesita guardar el `id` del contacto existente para poder hacer el update

**2. Enriquecer `checkExistingContact` (`src/lib/lead-validation.ts`)**
- Agregar al retorno: `contactId`, `contactPhone`, `contactEmail` para mostrar datos actuales y permitir el update

**3. Lógica de actualización (`NuevoContactoForm.tsx`)**
- Nuevo estado `existingContactData` con id, nombre, teléfono, email, agente, fecha
- Al elegir "Actualizar contacto": ejecutar `supabase.from("closers_contacts").update(...)` con los campos nuevos del formulario (teléfono, email, notas) sobre el `id` existente
- Mostrar toast de confirmación y navegar a `/contactos`

**4. Mismo tratamiento en `AddContactoModal.tsx` (leadgen)**
- Aplicar la misma lógica: diálogo de confirmación con opción de actualizar en vez de toast efímero

### Archivos a modificar
1. `src/lib/lead-validation.ts` — agregar `contactId`, `contactPhone`, `contactEmail` al retorno
2. `src/pages/contactos/NuevoContactoForm.tsx` — reemplazar toast por modal con opciones actualizar/crear nuevo
3. `src/pages/leadgen/AddContactoModal.tsx` — mismo tratamiento

