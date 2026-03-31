

## Plan: Agregar botón de WhatsApp en las tarjetas de ContactosGrid

### Cambio
Agregar un icono de WhatsApp al lado del icono de Instagram en cada tarjeta del grid de Contactos. El botón redirige a `https://wa.me/{número}` sin mostrar el número en la UI.

### Detalle técnico

**Archivo: `src/pages/contactos/ContactosGrid.tsx`**

1. Importar `MessageCircle` de lucide-react (ya se usa en otros componentes del módulo para WhatsApp)
2. Después del link de Instagram (línea 120), agregar condicionalmente un link de WhatsApp si `c.whatsapp` existe:
   - Icono `MessageCircle` con clase `h-4 w-4`
   - Link a `https://wa.me/${c.whatsapp}` con `target="_blank"`
   - Solo el icono, sin mostrar el número
   - `onClick` con `stopPropagation` para no abrir el modal de detalle
   - Mismo estilo visual que el link de Instagram (`text-muted-foreground hover:text-foreground`)

No se necesitan cambios en otros archivos — el campo `whatsapp` ya existe en el tipo `Contacto` y ya se mapea en `ContactosContent.tsx`.

