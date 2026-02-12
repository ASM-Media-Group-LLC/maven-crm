
# Crear modal "Nuevo Lead" al hacer clic en "+ Lead"

## Resumen

Crear un nuevo componente modal que se abre al presionar el boton "+ Lead" en el header de LeadGen. El modal sigue el patron existente de `AddCreadorModal` y el design system documentado.

## Campos del modal (segun la imagen de referencia)

1. **URL Perfil / Contacto** * - Input de texto, placeholder "https://instagram.com/..."
2. **Plataforma** * - Select con opciones: Instagram, TikTok, Twitter/X, OnlyFans, Otra
3. **Categoria** * - Select con opciones: A+, A, B+ (Buena), B, C
4. **Compania / Cuenta de Origen** * - Select con placeholder "Selecciona la compania"
5. **Pais** - Select con placeholder "Selecciona un pais"
6. **Notas** - Textarea con placeholder "Notas adicionales..."

## Feedback

- Toast de exito: `{ title: "Lead agregado exitosamente" }` usando `useToast`
- Toast de error: `{ title: "Error al agregar lead", variant: "destructive" }` usando `useToast`

## Archivos a crear/modificar

### Nuevo: `src/pages/leadgen/AddLeadModal.tsx`

- Dialog con titulo "Nuevo Lead" y descripcion breve
- Formulario con validacion usando `react-hook-form` + `zod`
- Campos obligatorios: URL Perfil/Contacto, Plataforma, Categoria, Compania
- Campos opcionales: Pais, Notas
- Footer con botones "Cancelar" (ghost) y "Agregar Lead" (primary, sin icono)
- Estado de carga en boton: "Agregando..."
- Como no hay tabla de leads en Supabase, el submit simulara un guardado exitoso con un timeout breve y mostrara el toast correspondiente
- Validacion de URL con formato basico (debe empezar con https://)
- Ancho del modal: `max-w-lg`
- Padding derecho en header: `pr-8` (patron estandar para evitar overlap con boton X)

### Modificar: `src/pages/leadgen/LeadGenContent.tsx`

- Importar `AddLeadModal`
- Agregar estado `const [addLeadOpen, setAddLeadOpen] = useState(false)`
- Conectar el boton "+ Lead" con `onClick={() => setAddLeadOpen(true)}`
- Renderizar `<AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />`

## Seccion tecnica

### Schema de validacion (zod)

```text
url_perfil: z.string().min(1, "URL requerida").url("URL invalida")
plataforma: z.string().min(1, "Plataforma requerida")
categoria: z.string().min(1, "Categoria requerida")
compania: z.string().min(1, "Compania requerida")
pais: z.string().optional()
notas: z.string().max(500).optional()
```

### Layout del formulario

- URL Perfil: ancho completo
- Plataforma + Categoria: grid 2 columnas
- Compania: ancho completo
- Pais: ancho completo
- Notas: textarea ancho completo

### Patron seguido

Mismo patron que `AddCreadorModal`: Dialog + react-hook-form + zod + toast de hooks/use-toast. Sin sonner.
