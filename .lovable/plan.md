

# Implementar vista de Historial de Cambios

## Descripcion

Crear el componente `HistorialTabContent` que muestre una linea de tiempo (timeline) con los cambios registrados en la tabla `creator_history` de Supabase, replicando el diseno visible en las imagenes de referencia.

## Diseno visual (basado en las imagenes)

- Card con titulo "Historial de Cambios" e icono, subtitulo "Auditoria completa de modificaciones"
- Timeline vertical con indicador circular azul (bg-primary) a la izquierda
- Cada entrada muestra:
  - Titulo de la accion (ej: "Nota agregada", "status") en negrita
  - "Modificado por [user_id]" en texto muted
  - Fecha alineada a la derecha (formato: "10 feb 2026, 15:49")
  - Bloque de detalle con labels de color:
    - "Antes:" en rojo (text-destructive) con old_value (solo si existe)
    - "Despues:" en verde (text-green-500) con new_value (solo si existe)
- Linea vertical conectando los puntos de la timeline
- Empty state cuando no hay registros

## Archivos

### 1. Nuevo: `src/pages/creadores/HistorialTabContent.tsx`

Componente principal con:
- Query a `creator_history` filtrado por `creator_id`, ordenado por `created_at` desc
- Timeline UI con los estilos del sistema de diseno (Card, CardHeader, CardTitle, CardDescription, Badge, Skeleton)
- Formateo de fecha con `date-fns` y locale `es`
- Empty state consistente con el patron de otros tabs (icono + mensaje centrado)

### 2. Editar: `src/pages/creadores/CreadorProfileContent.tsx`

- Importar `HistorialTabContent`
- Reemplazar el placeholder actual del TabsContent "historial" por el nuevo componente

## Seccion tecnica

**Tabla `creator_history`** (ya existe en BD):
- `id` (uuid)
- `creator_id` (uuid)
- `action` (string) - titulo del cambio
- `old_value` (string | null) - valor anterior
- `new_value` (string | null) - valor nuevo
- `user_id` (string) - quien realizo el cambio
- `created_at` (timestamp)

**Estructura del timeline item:**
```text
[dot]  Titulo de accion              Fecha
       Modificado por user_id
       
       Antes:  valor anterior
       Despues: valor nuevo
```

**Estilos clave:**
- Dot: `w-3 h-3 rounded-full bg-primary` con linea `border-l-2 border-border`
- Antes label: `text-destructive font-medium`
- Despues label: `text-green-500 font-medium`
- Fecha: `text-xs text-muted-foreground` alineada a la derecha
- Empty state: patron identico a NotasTabContent (icono grande + mensaje centrado + bg-muted/50)

