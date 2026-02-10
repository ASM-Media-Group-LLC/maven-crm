

# Redisenar modo edicion del tab Redes segun imagen de referencia

## Objetivo

Transformar el modo de edicion del tab Redes de inputs inline dentro de cards a un **formulario vertical con labels y campos full-width**, como se ve en la imagen de referencia. Adicionalmente, agregar los campos faltantes que existen en la base de datos: **LinkedIn URL** y **Chat URL**.

## Cambios en la visual de edicion

Actualmente, al hacer clic en "Editar", cada card muestra un input inline debajo del nombre de la plataforma. La imagen de referencia muestra un diseno diferente:

- En modo edicion, las cards desaparecen y se reemplazan por un **formulario vertical simple**
- Cada campo tiene un **Label** encima (ej: "Instagram URL", "Twitter/X URL") y un **Input full-width** debajo con placeholder descriptivo (ej: "https://instagram.com/username")
- Los campos se apilan verticalmente con spacing uniforme

## Campos a mostrar (orden segun referencia)

| Campo | Label | Placeholder | DB column |
|---|---|---|---|
| Instagram | Instagram URL | https://instagram.com/username | instagram_handle |
| WhatsApp | WhatsApp | +1234567890 o https://wa.me/... | whatsapp_number |
| Twitter/X | Twitter/X URL | https://x.com/username | twitter_handle |
| YouTube | YouTube URL | https://youtube.com/@channel | youtube_handle |
| TikTok | TikTok URL | https://tiktok.com/@username | tiktok_handle |
| LinkedIn | LinkedIn URL | https://linkedin.com/in/... | linkedin_handle |
| OnlyFans | OnlyFans URL | https://onlyfans.com/... | onlyfans_url |
| Chat URL | Chat URL | https://... | chat_url |

## Cambios tecnicos

### Archivo: `src/pages/creadores/RedesTabContent.tsx`

1. **Agregar campos a EditData y PlatformConfig**: incluir `linkedin_handle` y `chat_url`
2. **Agregar plataformas LinkedIn y Chat URL** al array `platforms` con sus iconos, labels y placeholders
3. **Modificar la seccion de renderizado**: cuando `isEditing` es `true`, en lugar de mostrar las cards con inputs inline, renderizar un formulario vertical con `Label` + `Input` por cada campo, usando `space-y-4` para el spacing
4. **Cuando `isEditing` es `false`**: mantener las cards actuales con hover e icono ExternalLink sin cambios
5. **Actualizar `handleSave`**: incluir `linkedin_handle` y `chat_url` en el update a Supabase
6. **Actualizar `startEditing`**: inicializar `linkedin_handle` y `chat_url` desde el creator
7. **Actualizar placeholders**: cambiar a URLs completas como referencia (ej: "https://instagram.com/username")
8. **Importar Label**: agregar import de `@/components/ui/label`

### Estructura del modo edicion

```text
Redes Sociales                    [Cancelar] [Guardar]
Enlaces a perfiles en redes sociales

Instagram URL
[_________________________ https://instagram.com/username]

WhatsApp
[_________________________ +1234567890 o https://wa.me/...]

Twitter/X URL
[_________________________ https://x.com/username]

YouTube URL
[_________________________ https://youtube.com/@channel]

TikTok URL
[_________________________ https://tiktok.com/@username]

LinkedIn URL
[_________________________ https://linkedin.com/in/...]

OnlyFans URL
[_________________________ https://onlyfans.com/...]

Chat URL
[_________________________ https://...]
```

### Modo lectura (sin cambios)

Las cards con iconos circulares, hover con gradiente y ExternalLink se mantienen identicas. Se agregan cards para LinkedIn y Chat URL.

