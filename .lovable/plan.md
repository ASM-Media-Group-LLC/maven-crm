

## Mejoras al Modal de Detalle del Lead

### 1. Hacer el modal mas amplio

Cambiar el ancho maximo del `DialogContent` de `sm:max-w-lg` (~32rem) a `sm:max-w-2xl` (~42rem) para que el contenido respire mejor y el grid de informacion no se vea apretado.

### 2. Funcionalidad de Notas Adicionales

Segun la imagen de referencia, al hacer clic en "+ Agregar" debe aparecer:
- Un `Textarea` con placeholder "Escribe tu nota..."
- Dos botones: "Guardar" (variante primary con icono de disco) y "Cancelar" (variante outline)

**Persistencia**: Como no existe una tabla separada para notas adicionales de leads, se necesita crear una tabla `lead_notes` en Supabase con la estructura:
- `id` (uuid, PK)
- `lead_id` (uuid, FK a leads)
- `note_text` (text)
- `created_at` (timestamptz)

Las notas guardadas se mostraran como una lista debajo del formulario, con fecha y texto.

### 3. Archivos a modificar

**Crear:**
- Migracion SQL para tabla `lead_notes` con RLS habilitado

**Modificar:**
- `src/pages/leadgen/ViewLeadModal.tsx`:
  - Cambiar `sm:max-w-lg` a `sm:max-w-2xl`
  - Agregar estado local `showNoteForm` (toggle al hacer clic en "+ Agregar")
  - Cuando `showNoteForm` es true: mostrar `Textarea` + botones "Guardar" y "Cancelar"
  - Cuando `showNoteForm` es false: mostrar empty state o lista de notas existentes
  - Agregar `useQuery` para cargar notas de `lead_notes` y `useMutation` para insertar nuevas notas
  - El boton "Cancelar" limpia el textarea y oculta el formulario

### 4. Detalle tecnico del formulario de notas

```text
Estado inicial:
  [Notas Adicionales]              [+ Agregar]
  (icono) No hay notas adicionales

Al hacer clic en "+ Agregar":
  [Notas Adicionales]
  +------------------------------------------+
  | Escribe tu nota...                       |
  |                                          |
  +------------------------------------------+
  [Guardar]  [Cancelar]

Despues de guardar:
  [Notas Adicionales]              [+ Agregar]
  - "Texto de la nota"  |  13 feb 2026
```

### 5. Patron de diseño
- Textarea usa el componente existente `@/components/ui/textarea`
- Boton "Guardar" con variante `default` e icono `Save`
- Boton "Cancelar" con variante `outline`
- Lista de notas guardadas con texto + fecha formateada
- Sin valores hardcoded de color

