

# Agregar iconos de plataformas externas y tooltips a las vistas de creadores

## Resumen

Agregar tooltips a todos los iconos de redes sociales existentes y mostrar un icono generico (Globe) para plataformas externas como OnlyFans, Piclink, etc. Sin eliminar ni modificar los iconos actuales de Instagram, TikTok y X.

## Datos disponibles en el modelo `creators`

Campos de links existentes que se usaran:

| Campo | Tipo | Icono actual | Tratamiento |
|---|---|---|---|
| `instagram_handle` | handle | Instagram | Mantener sin cambios + tooltip |
| `tiktok_handle` | handle | "TT" texto | Mantener sin cambios + tooltip |
| `twitter_handle` | handle | "X" texto | Mantener sin cambios + tooltip |
| `onlyfans_url` | URL completa | Ninguno | Globe generico + tooltip |
| `piclink_url` | URL completa | Ninguno | Globe generico + tooltip |
| `linkedin_handle` | handle | Ninguno | Globe generico + tooltip |
| `youtube_handle` | handle | Ninguno | Globe generico + tooltip |
| `chat_url` | URL completa | Ninguno | Globe generico + tooltip |

## Detalle tecnico

### Archivos modificados

**1. `src/pages/creadores/CreadoresTable.tsx`**

- Importar `Globe` de `lucide-react`
- Importar `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` de `@/components/ui/tooltip`
- Envolver cada icono social existente (Instagram, TikTok, X) con `Tooltip` mostrando el nombre de la red
- Agregar logica para recopilar links externos del creador (`onlyfans_url`, `piclink_url`, `linkedin_handle`, `youtube_handle`, `chat_url`)
- Si existe al menos un link externo: mostrar un unico icono `Globe` con tooltip "Ver plataforma"
  - Si hay exactamente un link: click abre directamente en nueva pestana
  - Si hay multiples links: usar `DropdownMenu` al hacer click, listando cada plataforma con su nombre
- Mantener mismos tamanos (`h-4 w-4`), colores y espaciado actuales

**2. `src/pages/creadores/CreadoresGrid.tsx`**

- Mismos imports y misma logica que en la tabla
- Envolver iconos existentes con `Tooltip`
- Agregar icono `Globe` en la seccion de footer (junto a los otros iconos sociales)
- Mantener `e.stopPropagation()` en los clicks para no activar el modal de vista

### Estructura del Tooltip (ejemplo para Instagram en tabla)

```tsx
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      <a href={...} target="_blank" rel="noopener noreferrer" ...>
        <Instagram className="h-4 w-4" />
      </a>
    </TooltipTrigger>
    <TooltipContent>Instagram</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

### Logica para links externos

```tsx
// Construir array de links externos disponibles
const externalLinks = [
  c.onlyfans_url && { label: "OnlyFans", url: c.onlyfans_url },
  c.piclink_url && { label: "Piclink", url: c.piclink_url },
  c.linkedin_handle && { label: "LinkedIn", url: `https://linkedin.com/in/${c.linkedin_handle}` },
  c.youtube_handle && { label: "YouTube", url: `https://youtube.com/@${c.youtube_handle}` },
  c.chat_url && { label: "Chat", url: c.chat_url },
].filter(Boolean);

// Si hay 1 link: Globe con click directo
// Si hay 2+: Globe con DropdownMenu listando opciones
```

### Comportamiento del icono Globe con multiples links

- Click en Globe abre un `DropdownMenu` con items que muestran el nombre de cada plataforma
- Cada item abre el link en nueva pestana
- Tooltip del Globe dice "Ver plataforma" (singular) o "Ver plataformas" (plural)

## Sin cambios

- No se modifican colores, tamanos ni posiciones de iconos existentes
- No se crean componentes nuevos
- No se modifican otros archivos
- No se requieren migraciones

