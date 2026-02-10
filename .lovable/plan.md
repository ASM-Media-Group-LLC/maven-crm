

# Tab de Redes Sociales - Nuevo componente visual

## Objetivo

Reemplazar el placeholder "Sin datos disponibles" del tab **Redes** en el perfil del creador con un componente funcional que muestre las redes sociales del creador, siguiendo el diseno de la imagen de referencia y el patron de edicion ya utilizado en InfoTabContent.

## Diseno visual (segun la imagen)

El tab muestra una tarjeta con:
- **Encabezado**: titulo "Redes Sociales", subtitulo "Enlaces a perfiles en redes sociales", y boton "Editar" alineado a la derecha (con icono de lapiz)
- **Lista de redes**: cada red es una fila con icono circular de la plataforma (usando los iconos personalizados existentes: InstagramIcon, TikTokIcon, XIcon), nombre de la plataforma y handle debajo
- **Modo edicion**: al hacer clic en "Editar", los handles se convierten en inputs editables (mismo patron que InfoTabContent), con botones "Cancelar" y "Guardar"
- Toasts de Sonner para feedback: exito, error y cancelacion

## Plataformas a mostrar

1. **Instagram** - icono InstagramIcon, handle de `instagram_handle`
2. **TikTok** - icono TikTokIcon, handle de `tiktok_handle`
3. **X (Twitter)** - icono XIcon, handle de `twitter_handle`
4. **YouTube** - icono "YT" en texto, handle de `youtube_handle`
5. **OnlyFans** - icono "OF" en texto, URL de `onlyfans_url`
6. **WhatsApp** - icono Phone de lucide, numero de `whatsapp_number`

## Cambios

### 1. Nuevo archivo: `src/pages/creadores/RedesTabContent.tsx`

Componente dedicado siguiendo el patron de InfoTabContent:

- **Props**: `creator` (CreatorFull) y `creatorId` (string)
- **Estado**: `isEditing` y `editData` con los campos de redes
- **Vista lectura**: tarjeta con borde, encabezado (titulo + boton Editar), y filas por cada red que tenga datos. Cada fila muestra: icono circular con fondo `bg-muted` (48px), nombre de plataforma en negrita, y handle/URL debajo en `text-muted-foreground`. Las redes sin datos no se muestran (o se muestran con un estado vacio sutil)
- **Vista edicion**: inputs para cada campo de red, con botones Cancelar (ghost) y Guardar
- **Guardado**: usa `supabase.from("creators").update(...)` directo (mismo patron que InfoTabContent), invalida query `["creator", creatorId]`
- **Toasts**: `toast.success("Redes actualizadas")` en exito, `toast.error("Error al guardar redes")` en error, `toast("Edicion cancelada")` en cancelar

### 2. Modificar: `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `RedesTabContent`
- Extraer "redes" del array de tabs placeholder (linea 176)
- Agregar un `TabsContent` dedicado para "redes" que renderice `<RedesTabContent creator={c} creatorId={id!} />`

## Detalles tecnicos

| Archivo | Cambio |
|---|---|
| `src/pages/creadores/RedesTabContent.tsx` | Nuevo componente con vista lectura/edicion de redes sociales |
| `src/pages/creadores/CreadorProfileContent.tsx` | Importar RedesTabContent, agregar TabsContent dedicado, remover "redes" del array placeholder |

- Se reutilizan los iconos existentes: `InstagramIcon`, `TikTokIcon`, `XIcon`, `Phone` de lucide
- Se reutilizan utilidades: `buildSocialUrl`, `displayHandle` de `@/lib/utils`
- Se usa `toast` de Sonner para feedback
- Patron de edicion identico a InfoTabContent (estado local, guardado directo a Supabase, invalidacion de cache)

