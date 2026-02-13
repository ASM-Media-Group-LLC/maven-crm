

## Modulo de Tareas Internas para Maven CRM

Sistema de tareas con countdown, control de cumplimiento y aislamiento por usuario.

---

### 1. Migracion SQL - Tabla `tasks`

```sql
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL,        -- references profiles.id
  created_by uuid NOT NULL,         -- references profiles.id
  company_id uuid,                  -- para aislamiento por empresa
  status text NOT NULL DEFAULT 'active',  -- active, completed, overdue
  duration_hours integer NOT NULL DEFAULT 0,
  duration_minutes integer NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  overdue_reason text,
  share_token text DEFAULT gen_random_uuid()::text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS: usuarios solo ven tareas asignadas a ellos o creadas por ellos
CREATE POLICY "Users can view own tasks"
  ON public.tasks FOR SELECT TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = created_by);

CREATE POLICY "Authenticated users can create tasks"
  ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Assigned users can update tasks"
  ON public.tasks FOR UPDATE TO authenticated
  USING (auth.uid() = assigned_to OR auth.uid() = created_by);

-- Trigger para updated_at
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

El campo `status` se calcula en el frontend comparando `due_at` con la hora actual para el countdown en tiempo real, y se actualiza en la base de datos cuando el usuario interactua (completa tarea o envia justificacion).

---

### 2. Archivos Nuevos

| Archivo | Proposito |
|---------|-----------|
| `src/pages/Tareas.tsx` | Pagina principal con layout (Sidebar + Topbar + contenido) |
| `src/pages/tareas/TareasContent.tsx` | Contenido principal: KPIs + lista de tareas |
| `src/pages/tareas/TaskCard.tsx` | Card individual con countdown, estado y acciones |
| `src/pages/tareas/CreateTaskModal.tsx` | Modal para crear nueva tarea |
| `src/pages/tareas/OverdueReasonModal.tsx` | Modal obligatorio para justificar tarea vencida |
| `src/pages/tareas/useTareas.ts` | Hook con queries y mutations de Supabase |
| `src/pages/tareas/useCountdown.ts` | Hook para countdown en tiempo real (useEffect + setInterval) |
| `src/pages/tareas/TaskSharePage.tsx` | Pagina publica para ver tarea compartida via token |

---

### 3. Estructura de la Pagina de Tareas

**Layout**: Mismo patron que Eventos (`SidebarProvider` + `DashboardSidebar` + `DashboardTopbar`).

**TareasContent.tsx**:
- Header con titulo "Tareas" y boton "Nueva Tarea"
- 3 KPI cards: Activas, Vencidas, Completadas (contadores)
- Lista de TaskCards ordenadas por:
  1. Vencidas (overdue) primero
  2. Proximas a vencer (menos de 30 min restantes)
  3. Activas
  4. Completadas al final

---

### 4. TaskCard - Componente Central

Cada card muestra:
- Titulo y descripcion breve
- Countdown grande en formato `HH:MM:SS` (usando `useCountdown`)
- Badge de estado: Activa (default), Proxima (warning/amarillo), Vencida (destructive), Completada (verde)
- Boton "Completar" (solo visible si `assigned_to === user.id`)
- Si esta vencida: boton "Justificar" que abre `OverdueReasonModal`
- Icono de compartir que copia link `/tareas/share/{share_token}`

**Logica de colores del countdown**:
- Mas de 30 min restantes: `text-foreground` (normal)
- Menos de 30 min: `text-warning` (amarillo)
- Vencida: `text-destructive` (rojo)

---

### 5. useCountdown Hook

```typescript
// Recibe due_at (ISO string), retorna { hours, minutes, seconds, isOverdue, isWarning }
// Usa setInterval cada 1 segundo
// Calcula diferencia entre due_at y Date.now()
// isWarning = remaining < 30 minutes
// isOverdue = remaining <= 0
```

---

### 6. CreateTaskModal

Campos del formulario:
- Titulo (text, requerido)
- Descripcion (textarea, opcional)
- Usuario asignado (select, carga usuarios de `profiles` filtrados por `company_id` del usuario actual)
- Duracion: dos inputs numericos lado a lado (Horas y Minutos)

Al guardar:
- Calcula `due_at = new Date(Date.now() + hours*3600000 + minutes*60000)`
- Inserta con `created_by = auth.uid()`, `company_id` del perfil del usuario
- Validacion con zod
- Toast de confirmacion

---

### 7. OverdueReasonModal

- Textarea obligatorio (minimo 10 caracteres)
- Boton "Enviar justificacion"
- Al enviar: actualiza `overdue_reason` y `status = 'overdue'` en la BD
- Una vez justificada, permite marcar como completada

---

### 8. Flujo de Completar Tarea

- Si `status === 'active'`: click en "Completar" actualiza `status = 'completed'`, `completed_at = now()`
- Si tarea vencida (`due_at < now`) y `overdue_reason` es null: abre `OverdueReasonModal` primero
- Si tarea vencida y `overdue_reason` existe: permite completar

---

### 9. Pagina de Compartir Tarea

**Ruta**: `/tareas/share/:token` (publica, sin auth)

- Muestra la tarea con countdown en modo solo lectura
- Card centrada con titulo, descripcion, countdown y estado
- Requiere una query sin RLS o una funcion RPC `get_task_by_token(token)` con `SECURITY DEFINER`

Funcion SQL:
```sql
CREATE OR REPLACE FUNCTION public.get_task_by_share_token(_token text)
RETURNS SETOF public.tasks
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.tasks WHERE share_token = _token LIMIT 1;
$$;
```

---

### 10. Cambios en Archivos Existentes

**`src/components/dashboard/DashboardSidebar.tsx`**:
- Agregar "Tareas" al grupo "Operaciones" con icono `CheckSquare` de lucide-react

**`src/App.tsx`**:
- Agregar ruta protegida `/tareas` con componente `Tareas`
- Agregar ruta publica `/tareas/share/:token` con componente `TaskSharePage`

---

### 11. Seccion Tecnica - Hook useTareas

```typescript
// Queries:
// - fetchTasks: SELECT * FROM tasks WHERE assigned_to = user.id OR created_by = user.id ORDER BY ...
// - fetchProfiles: SELECT id, full_name FROM profiles WHERE company_id = userCompanyId (para selector)

// Mutations:
// - createTask: INSERT INTO tasks
// - completeTask: UPDATE tasks SET status='completed', completed_at=now()
// - submitOverdueReason: UPDATE tasks SET overdue_reason=reason, status='overdue'
```

Usa `@tanstack/react-query` con invalidacion automatica tras mutations, siguiendo el patron existente del proyecto.

