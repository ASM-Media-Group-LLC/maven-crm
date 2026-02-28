

## Redisenar tabla de seguimiento en Personalizados

### Resumen

Se actualizara la tabla en `PersonalizadosPage.tsx` para incluir las columnas solicitadas con badges estilizados, una columna de Notas con Popover flotante, y una columna de Alerta de Envio con indicadores visuales.

### Cambios en un solo archivo

**Archivo:** `src/pages/creadores/personalizados/PersonalizadosPage.tsx`

### 1. Nuevas columnas de la tabla

Reemplazar las columnas actuales (Titulo, Creadora, Tipo, Estado, Prioridad, Fecha Limite, Acciones) por:

| Columna | Contenido |
|---|---|
| Creadora | Nombre artistico o nombre real de la creadora |
| Tipo de Contenido | Badge con color tenue segun tipo (foto, video, audio, texto, otro) |
| Fecha Limite | Fecha formateada con date-fns |
| Chatter/Usuario | Nombre del usuario que solicito (desde `profiles.full_name`) |
| Estado | Badge con colores tenues existentes (pendiente, en_progreso, completado, cancelado) |
| Notas | Icono de documento clicable que abre un Popover |
| Alerta de Envio | Check verde si completado, X roja si pendiente/retrasado |
| Acciones | Botones de ver y eliminar (sticky right) |

### 2. Columna "Notas" con Popover

- Se importara `Popover`, `PopoverTrigger`, `PopoverContent` desde `@/components/ui/popover`
- Al hacer clic en el icono `MessageSquare`, se abrira un Popover con fondo oscuro (`bg-card border`) que mostrara:
  - El titulo de la solicitud como encabezado
  - La descripcion completa
  - Las notas/detalles de pago
  - Un area para miniaturas de fotos de referencia (placeholder con icono de imagen si no hay fotos)
- Se usara `e.stopPropagation()` para evitar que el clic abra el modal de vista

### 3. Columna "Alerta de Envio"

Logica del indicador visual:
- **Check verde** (`CheckCircle2` con `text-green-400`): si `status === "completado"`
- **X roja** (`XCircle` con `text-red-400`): si `status === "pendiente"` o `status === "en_progreso"` y la fecha limite ya paso
- **Reloj amarillo** (`Clock` con `text-yellow-400`): si esta pendiente pero la fecha limite no ha pasado aun
- **Guion**: si no hay fecha limite asignada

### 4. Badges con colores tenues para tipo de contenido

Nuevo mapa de colores para la columna "Tipo":

```text
foto   -> bg-purple-500/15 text-purple-400 border-purple-500/20
video  -> bg-cyan-500/15 text-cyan-400 border-cyan-500/20  
audio  -> bg-pink-500/15 text-pink-400 border-pink-500/20
texto  -> bg-emerald-500/15 text-emerald-400 border-emerald-500/20
otro   -> bg-muted text-muted-foreground
```

### 5. Estilos de tabla

- Header sticky con `sticky top-0 z-10 bg-card`
- Columna acciones sticky right
- Texto de headers en `text-xs`
- ColSpan actualizado a 8 para los estados vacios/cargando

### Imports nuevos necesarios

- `Popover, PopoverTrigger, PopoverContent` de `@/components/ui/popover`
- `MessageSquare, XCircle, ImageIcon` de `lucide-react`

