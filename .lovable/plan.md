

# Ajustar seccion Documentacion segun imagen de referencia

## Resumen
Reemplazar la seccion de Documentacion actual (simplificada) por una version completa que replica 1:1 la imagen de referencia, incluyendo nuevos campos y logica condicional para PickLink.

## Cambios en `src/pages/creadores/NuevoCreadorForm.tsx`

### 1. Agregar campos nuevos al FormData y defaults
Nuevos campos:
- `piclink_url: string` (Direccion de PickLink)
- `piclink_monthly_payment: number` (Pago Mensual PickLink)
- `piclink_env_confirmed: boolean` (PickLink ENV Confirmado)

### 2. Actualizar testData con valores para los nuevos campos

### 3. Reescribir la Seccion 6 - Documentacion
Estructura segun la imagen:

```
Documentacion
├── Contrato Firmado & Documentos
│   ├── [Subir Archivos] (boton outline, alineado a la derecha)
│   └── "Formatos: PDF, Word (.doc, .docx) e Imagenes. Maximo 10MB por archivo, 10 archivos."
│
├── Card con borde redondeado:
│   ├── "Tiene PickLink Confirmado?" (titulo bold)
│   ├── "Marcar si el creador tiene PickLink activo" (subtitulo muted)
│   └── Checkbox alineado a la derecha
│
├── (Condicional: si has_piclink es true)
│   ├── Barra lateral izquierda azul/accent
│   ├── Grid 2 cols:
│   │   ├── "Direccion de PickLink" (Input, placeholder https://piclink.com/username)
│   │   └── "Pago Mensual PickLink" (Input number, placeholder 50.00)
│   └── "Fotos de PickLink (Comprobante)" (texto label)
│
├── Fotos y Videos Extras
│   ├── [Subir Archivos] (boton outline, alineado a la derecha)
│   └── "Formatos: Imagenes (JPG, PNG, GIF) y Videos (MP4, MOV). Maximo 20MB por archivo."
│
└── Card con borde redondeado:
    ├── "PickLink ENV Confirmado" (titulo bold)
    ├── "Tag 'ENV' configurado en Bios" (subtitulo muted)
    └── Checkbox alineado a la derecha (sin check)
```

### 4. Actualizar handleSubmit
Agregar los nuevos campos al objeto `business`:
- `piclink_url: form.piclink_url || null`
- `piclink_monthly_payment: form.piclink_monthly_payment || null`
- `piclink_env_confirmed: form.piclink_env_confirmed`

### Detalle tecnico

**Campos condicionales:** Cuando `has_piclink` es true, se muestran los campos de Direccion de PickLink y Pago Mensual con un borde izquierdo de acento (clase `border-l-2 border-primary pl-4`).

**Checkboxes en cards:** Los dos checkboxes (PickLink Confirmado y ENV Confirmado) se renderizan dentro de cards con layout flex justify-between, texto a la izquierda y checkbox a la derecha.

**Botones Subir Archivos:** Se mantienen como botones outline deshabilitados con el icono Upload, alineados a la derecha con flex justify-between respecto al titulo.

**Mapeo a DB:** Los campos `piclink_url`, `piclink_monthly_payment` y `piclink_env_confirmed` ya existen en la tabla `creator_business` (como `piclink_url` no existe directamente, se usara el campo `piclink_url` del table `creators`). Revisando: `creator_business` tiene `piclink_env_confirmed` y `piclink_monthly_payment`. El campo `piclink_url` existe en la tabla `creators`.

## Archivos modificados
- `src/pages/creadores/NuevoCreadorForm.tsx`

