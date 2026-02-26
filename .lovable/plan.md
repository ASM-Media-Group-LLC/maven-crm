

## Plan: Tarjeta de Avisos siempre visible + Módulo de Gestión de Anuncios

### Diagnóstico

**Problema 1 — Cumpleaños/Avisos no se muestran**: La tarjeta "Avisos y Celebraciones" en `DashboardContent.tsx` (línea 359) está envuelta en una condición `hasBirthdaysOrAnnouncements` que la oculta completamente cuando no hay datos. Si no hay cumpleaños próximos ni anuncios creados, la tarjeta desaparece por completo. Esto hace que el usuario no sepa que existe.

**Problema 2 — No existe UI para crear anuncios**: La tabla `internal_announcements` existe en la base de datos, y el hook `useAnnouncements` la consulta, pero no hay ninguna pantalla, modal ni formulario en toda la plataforma para crear, editar o eliminar anuncios. Solo se podría hacer directamente en la consola de Supabase.

### Cambios propuestos

| # | Archivo | Cambio |
|---|---------|--------|
| 1 | `DashboardContent.tsx` | Mostrar la tarjeta "Avisos y Celebraciones" siempre (eliminar condición `hasBirthdaysOrAnnouncements`). Cuando no haya datos, mostrar estado vacío con texto "Sin avisos por el momento" |
| 2 | `src/pages/hr/HRAnnouncements.tsx` | Crear página completa de gestión de anuncios internos dentro del módulo HR, con tabla, filtros, y acciones CRUD |
| 3 | `src/pages/hr/announcements/CreateAnnouncementModal.tsx` | Modal para crear nuevo anuncio (título, mensaje, tipo, prioridad, fecha inicio, fecha expiración) |
| 4 | `src/pages/hr/announcements/EditAnnouncementModal.tsx` | Modal para editar anuncio existente |
| 5 | `src/pages/hr/announcements/DeleteAnnouncementDialog.tsx` | Diálogo de confirmación para eliminar/desactivar anuncio |
| 6 | `src/pages/hr/announcements/useAnnouncements.ts` | Hook con queries CRUD (crear, editar, desactivar, listar todos incluyendo inactivos y expirados) |
| 7 | `src/App.tsx` | Agregar ruta `/hr/anuncios` |
| 8 | `DashboardSidebar.tsx` o `HRLayout.tsx` | Agregar link de navegación al módulo de anuncios dentro de HR |

### Detalle técnico

**Fix de la tarjeta en el Dashboard** — Cambio mínimo:
```typescript
// Antes (línea 359):
{hasBirthdaysOrAnnouncements ? (
  <Card>...</Card>
) : null}

// Después:
<Card>
  {birthdays.length === 0 && announcements.length === 0 ? (
    <div className="text-center text-sm text-muted-foreground py-8">
      Sin avisos por el momento
    </div>
  ) : (
    // ... contenido actual de cumpleaños y anuncios
  )}
</Card>
```

**Página de Gestión de Anuncios** (`/hr/anuncios`):
- Layout estándar: header fijo (`text-xl font-semibold`), KPIs (activos, expirados, alta prioridad), tabla con columnas: Título, Tipo, Prioridad, Inicio, Expiración, Estado
- Filtros por tipo (`general`, `policy`, `celebration`, `holiday`) y prioridad
- Botón "Nuevo Anuncio" que abre modal con formulario
- Acciones por fila: Editar, Desactivar/Activar, Eliminar
- Acceso restringido por permisos (admin y managers vía `usePermissions`)

**Modal de Creación**:
```typescript
// Campos del formulario:
- title: text (requerido)
- message: textarea (opcional, para detalles)
- announcement_type: select ['general', 'policy', 'celebration', 'holiday']
- priority: select ['low', 'normal', 'high']
- starts_at: datetime (default: ahora)
- expires_at: datetime (opcional, null = sin expiración)
```

**Hook CRUD**:
```typescript
// useAnnouncementsAdmin — para la página de gestión
const useAnnouncementsAdmin = () => useQuery({
  queryKey: ["admin-announcements"],
  queryFn: async () => {
    const { data } = await supabase
      .from("internal_announcements")
      .select("*")
      .order("created_at", { ascending: false });
    return data;
  },
});

// Mutations: insert, update (is_active toggle), delete
```

### Ubicación en la navegación

El módulo de anuncios se ubicará dentro de HR como un submódulo. En el sidebar de HR se agregará un enlace "Anuncios Internos" con icono `Megaphone`. También se puede acceder desde el dashboard si se incluye en las Quick Actions.

### Orden de implementación

1. Fix tarjeta dashboard — mostrar siempre con estado vacío
2. Hook CRUD para gestión de anuncios (`useAnnouncementsAdmin`)
3. Página `/hr/anuncios` con tabla y filtros
4. Modales de crear, editar y eliminar
5. Ruta en `App.tsx` + link en navegación HR

