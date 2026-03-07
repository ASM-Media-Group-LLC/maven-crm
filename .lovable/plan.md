

## Plan: Mejorar página de Notificaciones

### Cambios a realizar

#### 1. Layout con header y filtros fijos (`Notificaciones.tsx`)

Reestructurar usando el patrón `h-full` con header/filtros en `shrink-0` y lista en `flex-1 overflow-auto`:

```text
HRLayout (h-screen)
  └─ div (h-full flex flex-col)
      ├─ Header + Filtros (shrink-0, p-4/p-6)  ← FIJO
      └─ Lista (flex-1 overflow-auto)            ← SCROLLABLE
```

Usar `HRLayout` como wrapper en lugar del inline `SidebarProvider + DashboardSidebar + DashboardTopbar`.

#### 2. Tipografía consistente

- Título: `text-xl font-bold` (en vez de `text-lg font-semibold`)
- NotificationItem: título `text-sm` (en vez de `text-xs`), mensaje `text-xs`, timestamp `text-[11px]`
- Filtros: mantener `text-xs` en SelectTrigger (consistente con otras secciones)

#### 3. Agregar acción "Eliminar notificación"

- Agregar mutation `deleteNotification` en `useNotifications.ts` que hace `.delete().eq("id", id)`
- Agregar botón de eliminar (Trash2 icon) en `NotificationItem.tsx` al lado del botón archivar, con confirmación visual
- Agregar `onDelete` prop al `NotificationItem`

#### 4. Botón de Configuración de notificaciones

- Agregar botón con icono Settings en el header que navega a `/ajustes/notificaciones`
- En `NotificacionesSettings.tsx`:
  - Usar `HRLayout` para consistencia
  - Agregar columna "WhatsApp" al lado de "Email" con badge "Próximamente"
  - Ajustar tipografía a `text-sm` para títulos de tipo

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `src/pages/Notificaciones.tsx` | Layout fijo, usar HRLayout, tipografía, botón config |
| `src/components/notifications/NotificationItem.tsx` | Tipografía, botón eliminar |
| `src/hooks/useNotifications.ts` | Agregar mutation `deleteNotification` |
| `src/pages/ajustes/NotificacionesSettings.tsx` | Layout HRLayout, columna WhatsApp |

