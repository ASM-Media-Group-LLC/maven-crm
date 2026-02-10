

# Ajustes en campos del tab Redes (modo edicion)

## Cambios solicitados

1. **Agregar campo "Seguidores Instagram"**: Campo numerico que guarda en la columna `instagram_followers` (integer) de la tabla `creators`.
2. **Quitar campo "Chat URL"**: Eliminar la entrada de `chat_url` del array `platforms` y del estado `EditData`.
3. **Renombrar label de WhatsApp**: Cambiar de "WhatsApp" a "WhatsApp (Numero o Link API)" en el `editLabel`.

## Archivo: `src/pages/creadores/RedesTabContent.tsx`

### 1. Agregar `instagram_followers` a `EditData`
- Agregar `instagram_followers: string` a la interface `EditData` (se maneja como string en el input y se convierte a number al guardar).

### 2. Agregar entrada en el array `platforms`
- Nueva entrada justo despues de Instagram:
  - key: `instagram_followers`
  - label: "Seguidores Instagram"
  - editLabel: "Seguidores Instagram"
  - icon: icono de InstagramIcon
  - placeholder: "Ej: 150000"
  - Solo aparece en modo edicion (no tiene card en modo lectura, o se muestra como dato informativo)

### 3. Eliminar `chat_url`
- Remover la entrada de `chat_url` del array `platforms`
- Remover `chat_url` de la interface `EditData`
- Remover `chat_url` del estado inicial, de `startEditing` y de `handleSave`
- Remover import de `MessageCircle` de lucide-react

### 4. Renombrar label de WhatsApp
- Cambiar `editLabel` de `"WhatsApp"` a `"WhatsApp (Numero o Link API)"`

### 5. Actualizar `startEditing`
- Inicializar `instagram_followers` desde `creator.instagram_followers` (convertir number a string)

### 6. Actualizar `handleSave`
- Incluir `instagram_followers: editData.instagram_followers ? parseInt(editData.instagram_followers, 10) : null` en el update a Supabase

### Orden final de campos

1. Instagram
2. **Seguidores Instagram** (nuevo)
3. WhatsApp (Numero o Link API) (renombrado)
4. Twitter/X
5. YouTube
6. TikTok
7. LinkedIn
8. OnlyFans
9. PicLink

