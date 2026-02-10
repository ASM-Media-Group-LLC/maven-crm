

# Redisenar tab Redes con Cards individuales, hover y enlace externo

## Objetivo

Transformar el tab de Redes Sociales de una lista en una sola tarjeta a **cards individuales por red social**, con efecto hover tipo gradiente primary (como se ve en la imagen de referencia: fondo violeta/primary al hacer hover) y un icono de enlace externo (`ExternalLink` de Lucide) que al hacer clic abra el perfil en la red correspondiente.

## Cambios

**Archivo unico:** `src/pages/creadores/RedesTabContent.tsx`

### Estructura visual (modo lectura)

Reemplazar el contenedor unico `<div className="rounded-lg border...">` por un grid/stack de cards individuales. Cada card:

- Borde redondeado con `border border-border bg-card`
- Fila horizontal: icono circular (bg-muted) + nombre de plataforma y handle + icono `ExternalLink` alineado a la derecha
- **Hover**: transicion suave con fondo `bg-primary` y texto blanco (`hover:bg-primary hover:text-primary-foreground transition-colors duration-200`), replicando el efecto violeta de la imagen
- El icono `ExternalLink` funciona como enlace: abre `buildSocialUrl(platform, handle)` en nueva pestana. Para OnlyFans usa la URL directa, para WhatsApp usa `https://wa.me/{number}`
- Si la red no tiene datos, la card se muestra con handle "---" y sin enlace activo

### Estructura visual (modo edicion)

- Mismas cards pero con Input en lugar del handle
- Sin icono de enlace externo durante edicion
- Botones Guardar/Cancelar en el header (sin cambios)

### Configuracion de plataformas actualizada

Agregar un campo `buildUrl` a cada `PlatformConfig` para construir la URL de enlace:

| Plataforma | buildUrl |
|---|---|
| Instagram | `buildSocialUrl("instagram", handle)` |
| TikTok | `buildSocialUrl("tiktok", handle)` |
| X (Twitter) | `buildSocialUrl("twitter", handle)` |
| YouTube | `buildSocialUrl("youtube", handle)` |
| OnlyFans | URL directa del campo `onlyfans_url` |
| WhatsApp | `https://wa.me/{number}` |

### Imports nuevos

- Agregar `ExternalLink` de `lucide-react`
- Agregar `buildSocialUrl` de `@/lib/utils` (ya importa `displayHandle`)

### Toasts

Sin cambios, se mantienen los existentes (exito, error, cancelacion).

## Detalle tecnico de la card

```text
+------------------------------------------------------------------+
| [icon circle]  Platform Name              [ExternalLink icon]    |
|                @handle                                            |
+------------------------------------------------------------------+
```

En hover toda la card cambia a fondo primary con texto blanco, incluyendo el icono.

