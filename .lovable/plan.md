

## Plan: Actualizar el Roadmap con el progreso de hoy

### Contexto
El roadmap se almacena en tablas de Supabase (`roadmap_categories` y `roadmap_items`). No puedo hacer queries directas en modo plan, así que el plan es agregar/actualizar items via la UI existente o mediante SQL.

### Estrategia
Ejecutar SQL contra Supabase para:

**1. Asegurar que existen las categorías relevantes**
Verificar/crear categorías como: "Messenger", "Video Calls", "Finanzas", "Creadores", "Dashboard/Sidebar", "LeadGen/Promolog", "Auth/Testing"

**2. Insertar los 10 items completados hoy como `status = 'done'`**

```sql
-- Ejemplo de inserts (se adaptarán a las categorías existentes)
INSERT INTO roadmap_items (category_id, task, status, completed_at, position)
VALUES
  ('<messenger_cat_id>', 'Corregir sidebar cortado en cards de conversación', 'done', NOW(), ...),
  ('<messenger_cat_id>', 'Acciones anclar/archivar/eliminar en sidebar y header', 'done', NOW(), ...),
  ('<messenger_cat_id>', 'Admins pueden eliminar cualquier conversación', 'done', NOW(), ...),
  ('<messenger_cat_id>', 'Sonidos de notificación en chat', 'done', NOW(), ...),
  ('<videocalls_cat_id>', 'Corregir audio en videollamadas (AudioContext)', 'done', NOW(), ...),
  ('<finanzas_cat_id>', 'Simplificar modal comisiones con % automático del creador', 'done', NOW(), ...),
  ('<creadores_cat_id>', 'Mejorar layout KPIs y scroll de tabla', 'done', NOW(), ...),
  ('<dashboard_cat_id>', 'Badges dinámicos en sidebar (Promolog, LeadGen, Closers)', 'done', NOW(), ...),
  ('<dashboard_cat_id>', 'Quitar filtros de fecha por defecto en vistas', 'done', NOW(), ...),
  ('<auth_cat_id>', 'Crear página /credentials con cuentas de prueba por rol', 'done', NOW(), ...);
```

**3. Revisar items existentes que ya estaban como `todo` o `in_progress`**
Si alguno de los cambios de hoy corresponde a items ya existentes en el roadmap, marcarlos como `done` en lugar de duplicar.

### Ejecución
Primero consultaré las categorías y items existentes en la DB para evitar duplicados, luego insertaré/actualizaré según corresponda.

### Archivos
- Sin cambios de código — solo operaciones en base de datos (`roadmap_categories`, `roadmap_items`)

