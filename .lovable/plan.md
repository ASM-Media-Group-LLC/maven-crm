

# Agregar campos adicionales al modal "Editar Creador"

## Resumen
Agregar los campos faltantes al modal de edicion segun el mockup: YouTube, OnlyFans URL, WhatsApp y Biografia. Tambien reorganizar la seccion de Redes Sociales en grid de 2 columnas.

## Cambios en `src/pages/creadores/EditCreadorModal.tsx`

### Campos nuevos en el formulario
Agregar al estado del formulario:
- `youtube_handle` (input, placeholder: "@canal")
- `onlyfans_url` (input, placeholder: "https://onlyfans.com/...")
- `whatsapp_number` (input, placeholder: "+1 234 567 8900")
- `bio` (textarea, placeholder: "Breve descripcion del creador...")

### Reorganizar seccion Redes Sociales
Cambiar el grid de 3 columnas a 2 columnas con los siguientes campos:
1. Instagram | Twitter/X
2. TikTok | YouTube
3. OnlyFans URL | WhatsApp

### Agregar seccion Biografia
Debajo de Redes Sociales, agregar un campo de textarea de ancho completo con label "Biografia".

### Mapeo a la tabla `creators`
| Campo UI | Campo DB |
|----------|----------|
| YouTube | youtube_handle |
| OnlyFans URL | onlyfans_url |
| WhatsApp | whatsapp_number |
| Biografia | bio |

Todos estos campos ya existen en la tabla `creators` de Supabase.

### Cambiar label "Twitter" a "Twitter/X"
Actualizar el label del campo existente de Twitter a "Twitter/X" para coincidir con el mockup.

## Archivo modificado
- `src/pages/creadores/EditCreadorModal.tsx`

