

## Módulo de Offboarding — Gestión de Salida de Empleados

Se construirán dos páginas nuevas siguiendo exactamente el patrón de Onboarding (KPIs, department tabs, filtros, list/grid, modales Ver/Editar/Eliminar) + una tabla de tareas de offboarding en la base de datos.

---

### 1. Nueva tabla: `employee_offboarding_tasks`

La tabla `employee_offboarding` ya existe pero no tiene una tabla de tareas asociada (como `employee_onboarding_tasks`). Se creará una migración para:

```sql
CREATE TABLE employee_offboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offboarding_id UUID NOT NULL REFERENCES employee_offboarding(id) ON DELETE CASCADE,
  category TEXT,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE employee_offboarding_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can manage employee_offboarding_tasks"
  ON employee_offboarding_tasks FOR ALL USING (true) WITH CHECK (true);
```

---

### 2. Página de listado: `HROffboarding.tsx`

Misma estructura que `HROnboarding.tsx`:

- **Header:** Titulo "Offboarding", subtitulo, boton "Iniciar Offboarding" que navega a `/hr/offboarding/nuevo`
- **KPIs (4 cards):** Total, En Progreso, Completados, Pago Pendiente
- **Department Tabs:** Tabs de departamento
- **Filtros:** Search, Select status (in_progress/completed), toggle list/grid
- **Table columns:** Empleado, Tipo Salida, Fecha Terminación, Accesos Revocados, Equipo Devuelto, Pago Final, Progreso (barra de tareas), Estado, Acciones (Ver/Editar/Eliminar)
- **Grid cards:** Avatar+nombre, badges de tipo/status, barra de progreso, checkmarks de accesos/equipo
- **Modal Ver:** Detalle completo con checklist de tareas, notas de entrevista de salida
- **Modal Editar:** Cambiar status, access_revoked, equipment_returned, final_payment_status, exit_interview_notes
- **Dialog Eliminar:** Confirmación con borrado de tareas asociadas

---

### 3. Página de inicio: `HROffboardingNew.tsx`

Misma estructura que `HROnboardingNew.tsx`:

- **Header:** "Iniciar Offboarding" con botón volver
- **Card 1 — Selección de Empleado:** Select con empleados activos (excluyendo los que ya tienen offboarding activo)
- **Card 2 — Configuración:**
  - Tipo de Terminación (Select: Voluntaria, Involuntaria, Fin de Contrato, Mutuo Acuerdo)
  - Fecha de Terminación (DateInput, requerido)
  - Motivo de Salida (Textarea)
  - Fecha Entrevista de Salida (DateInput, opcional)
- **Card 3 — Checklist de Offboarding:** Checklist categorizado con selección masiva por categoría:
  - **Accesos:** Revocar correo corporativo, Revocar acceso a plataformas, Revocar VPN/sistemas, Desactivar badge/tarjeta
  - **Equipamiento:** Devolución de laptop/PC, Devolución de badge/llaves, Devolución de otros equipos
  - **Documentación:** Carta de terminación, Paz y salvo, Certificado laboral, Liquidación calculada
  - **Transferencia:** Transferencia de responsabilidades, Documentación de procesos, Entrega de archivos/proyectos
  - **Administrativo:** Notificación al equipo, Desvinculación de seguridad social, Cierre de nómina
- **Footer:** Cancelar + "Iniciar Offboarding" (inserta en `employee_offboarding` + `employee_offboarding_tasks`)

---

### 4. Sidebar — Activar enlace

En `DashboardSidebar.tsx`, cambiar `{ title: "Offboarding", url: null }` a `{ title: "Offboarding", url: "/hr/offboarding" }`.

---

### 5. Rutas en App.tsx

Agregar dos rutas:
- `/hr/offboarding` → `HROffboarding` envuelto en `HRLayout`
- `/hr/offboarding/nuevo` → `HROffboardingNew` envuelto en `HRLayout`

---

### Resumen de archivos

| Archivo | Acción |
|---------|--------|
| Migración SQL | Crear tabla `employee_offboarding_tasks` |
| `src/pages/hr/HROffboarding.tsx` | **Nuevo** — Listado con KPIs, filtros, list/grid, modales |
| `src/pages/hr/HROffboardingNew.tsx` | **Nuevo** — Formulario de inicio con checklist categorizado |
| `src/components/dashboard/DashboardSidebar.tsx` | Activar URL de Offboarding |
| `src/App.tsx` | Agregar 2 rutas + imports |

