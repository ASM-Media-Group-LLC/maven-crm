

## Actualización del Roadmap: Estado real + Módulos pendientes

### 1. Marcar como "done" los módulos ya construidos

Los siguientes 6 items están marcados como "todo" pero ya están completamente funcionales en la plataforma:

**Eventos (3 items):**
- CRUD y detalle de eventos
- Invitados, checklist, métricas
- Calendario y compartir externo

**Recursos y Admin (3 items):**
- Gestión de usuarios y roles
- Auditoría de roles
- Tracker de progreso de plataforma

Se actualizarán a status "done" con `completed_at` = fecha actual.

### 2. Agregar 3 items a "Módulos Pendientes"

La categoría "Módulos Pendientes" ya existe pero tiene 0 items. Se agregarán:

| Submodule | Task | Status |
|-----------|------|--------|
| RRHH | Gestión de Empleados (RRHH) | todo |
| Finanzas | Contabilidad | todo |
| Creadoras | Gestión de Creadoras | todo |

### Resultado esperado

Después de los cambios, el progreso general subirá significativamente ya que 6 items pasarán de "todo" a "done", y se agregarán 3 nuevos items pendientes.

---

### Sección técnica

**Método:** Migraciones SQL directas sobre las tablas `roadmap_items` y `roadmap_categories`.

**Migración 1 - Actualizar estados:**
```sql
UPDATE roadmap_items 
SET status = 'done', completed_at = NOW()
WHERE id IN (
  '6f20fdd4-3163-4e7f-92bb-1ad46e3755f8',
  'b4294c98-0782-4a71-af50-e2c8d61a3026',
  'b2509632-51e9-4a85-ab29-78d8e82f05a3',
  'ddd7b605-aa3e-4cbd-9e59-d83967f0a06f',
  'c28a5e2b-c4fd-4ec9-8432-214db771049c',
  'a726259b-c554-4750-98e4-e205a1947ab8'
);
```

**Migración 2 - Insertar módulos pendientes:**
```sql
INSERT INTO roadmap_items (category_id, submodule, task, status, position)
VALUES
  ('a0000001-0000-0000-0000-000000000008', 'RRHH', 'Gestión de Empleados (RRHH)', 'todo', 1),
  ('a0000001-0000-0000-0000-000000000008', 'Finanzas', 'Contabilidad', 'todo', 2),
  ('a0000001-0000-0000-0000-000000000008', 'Creadoras', 'Gestión de Creadoras', 'todo', 3);
```

No se requieren cambios de código, solo actualizaciones de datos en la base de datos.

