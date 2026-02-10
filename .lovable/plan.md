

# Agregar campo faltante: PicLink URL

## Hallazgo

Revisando la base de datos y las imagenes de referencia, el campo **`piclink_url`** existe en la tabla `creators` pero no esta incluido en el tab de Redes. Este es el campo que falta.

## Campos actuales vs campos en BD

| Campo | En componente | En BD |
|---|---|---|
| Instagram | Si | Si |
| WhatsApp | Si | Si |
| Twitter/X | Si | Si |
| YouTube | Si | Si |
| TikTok | Si | Si |
| LinkedIn | Si | Si |
| OnlyFans | Si | Si |
| Chat URL | Si | Si |
| **PicLink** | **No** | **Si (`piclink_url`)** |

## Cambios

### Archivo: `src/pages/creadores/RedesTabContent.tsx`

1. **Agregar `piclink_url` a `EditData`**: nuevo campo string en la interface
2. **Agregar plataforma PicLink al array `platforms`**:
   - key: `piclink_url`
   - label: "PicLink"
   - editLabel: "PicLink URL"
   - icon: icono `Link` de lucide-react
   - placeholder: "https://piclink.com/..."
   - displayValue: URL directa o "---"
   - buildUrl: URL directa
3. **Actualizar `startEditing`**: inicializar `piclink_url` desde `creator.piclink_url`
4. **Actualizar `handleSave`**: incluir `piclink_url` en el update a Supabase
5. **Importar `Link` de lucide-react** para el icono de PicLink

### Orden final de campos

1. Instagram
2. WhatsApp
3. Twitter/X
4. YouTube
5. TikTok
6. LinkedIn
7. OnlyFans
8. PicLink
9. Chat URL

