

## Agregar campos condicionales al modal "Editar Promocion"

### Cambios en `src/pages/promolog/PromologEntryCard.tsx`

Se agregaran 4 nuevas secciones al modal que solo aparecen cuando `editResult === "si"` (Si Promociono):

### 1. Plataforma (toggle buttons, grid 3 columnas)
Opciones: OnlyFans, Unlok, Otra. Misma estetica que los botones de Red Social (borde primary cuando seleccionado). Nuevo estado: `editPlatform`.

### 2. Tipo de Contacto (toggle buttons, grid 3 columnas)
Opciones: Hablaron, Textearon, Mensaje de Voz. Misma estetica. Nuevo estado: `editContactType`.

### 3. Notas (textarea)
Un campo de texto libre con label "Notas". Nuevo estado: `editNotes`, inicializado con `entry.notes`.

### 4. Evidencia (Pantallazo)
- Label "Evidencia (Pantallazo)" con subtexto "Upload Evidence"
- Input file (accept image) para seleccionar archivo
- Preview de la imagen seleccionada debajo del input
- Boton "Abrir en nueva pestana" que abre la imagen en una nueva tab
- Nuevo estado: `editEvidence` (File | null) y `editEvidencePreview` (string URL)

### Detalle tecnico

**Nuevos estados:**
```
editPlatform: string (onlyfans | unlok | otra)
editContactType: string (hablaron | textearon | mensaje_voz)
editNotes: string
editEvidence: File | null
editEvidencePreview: string
```

**Inicializacion en handleOpenEdit:**
- `editPlatform` se inicializa con el platform del entry (lowercase)
- `editContactType` se inicializa vacio
- `editNotes` se inicializa con `entry.notes`
- `editEvidence` y `editEvidencePreview` se resetean

**Estructura condicional:** Todo el bloque de Plataforma + Tipo de Contacto + Notas + Evidencia se envuelve en `{editResult === "si" && (...)}` para que solo aparezca cuando se selecciona "Si Promociono".

**Imports adicionales:** `ExternalLink` de lucide-react, `Textarea` de `@/components/ui/textarea`.

**Scroll:** Se agregara `max-h-[80vh] overflow-y-auto` al DialogContent para que el modal sea scrollable cuando hay muchos campos visibles.

