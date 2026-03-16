

## Plan: Refactorizar Módulo Closers — Simplificar Pipeline + Agregar Funcionalidades

### Situación Actual
El módulo opera sobre `leadgen_entries` con 8 tabs y KPIs de conteo simple. La tabla `closer_creators` existe (1 registro) pero no se usa en el flujo principal. Hay componentes legacy en `tabs/` sin uso real.

### Decisión Clave
Migrar el módulo de `leadgen_entries` a `closer_creators` como tabla principal. Los leads llegan desde LeadGen y se crean como registros en `closer_creators`. Esto permite campos específicos de closers (monetización, plataformas, revenue, assignment) sin contaminar LeadGen.

---

### 1. Migraciones de Base de Datos

**Agregar columnas a `closer_creators`:**
- `main_platform` (text) — OnlyFans/Trafix/Blu/Piclink/Otra
- `extras` (numeric, default 0) — extras financieros

**Crear tabla `closer_platform_sales`:**
- `id`, `creator_id` (FK → closer_creators), `platform`, `product`, `price`, `created_by`, `created_at`
- RLS: closers ven solo sus registros (via `assigned_to` del creator), admin ve todo

### 2. Simplificar Tabs (en `ClosersContent.tsx`)

Reemplazar los 8 tabs actuales por 5:

```
Todas | Asignadas | Confirmadas | Completadas | No interesadas
```

Actualizar `TAB_STATUS_MAP` en `useCloserLeads.ts` → ahora mapea a stages de `closer_creators` en vez de statuses de `leadgen_entries`. Cambiar el hook para que consulte `closer_creators` con join a `profiles` (para nombre del agente) y count de `closer_contact_history`.

### 3. Actualizar KPIs (`ClosersKPICards.tsx`)

Reemplazar las 7 cards actuales por 2 filas:

**Fila 1 — Pipeline:** Total asignadas, Confirmadas, Completadas, Cerradas (confirmadas + completadas)

**Fila 2 — Revenue:** Revenue OnlyFans, Revenue Trafix, Revenue Blu, Revenue Piclink, Revenue total, Revenue leak (no interesadas × monetización promedio)

Los datos vienen de `closer_creators` (stages) + `closer_platform_sales` (revenue por plataforma).

### 4. Actualizar `LeadTable.tsx` → Tabla de Closers

Adaptar las columnas de la tabla según la sección activa:

**Tab Asignadas:** Modelo (Instagram), Fecha asignación, Agente, # contactos, Última fecha contacto, Alertas (badge si >3 días sin contacto o contacto 6/6), Acciones (registrar contacto, mover a confirmada/no interesada)

**Tab Confirmadas:** Modelo, Agente, Fecha confirmación, Monetización (editable), % comisión (editable), Extras (editable), Plataforma principal (select), Revenue calculado

**Tab Completadas:** Modelo, Agente, Monetización, % comisión, Extras, Revenue. Footer con sumas totales.

**Tab No interesadas:** Modelo, Closer, Fecha último contacto, Motivo rechazo (editable), Notas

### 5. Secuencia de Contactos y Alertas

En el hook `useCloserLeads.ts` (renombrado o refactorizado), calcular para cada creator:
- `nextContactDate` basado en la secuencia [1, 3, 5, 8, 15, 29] días desde `passed_date`
- `isFollowUpPending` si >3 días sin contacto
- `isLastAttempt` si contact_count === 6

Mostrar badges en la tabla de Asignadas.

### 6. Registro de Contactos desde la Tabla

Agregar botón "Registrar contacto" en las acciones de cada fila de Asignadas. Al hacer clic, abre un mini-form inline o popover (reutilizando la lógica de `ContactHistoryPanel`) con campos: Canal (Instagram/WhatsApp/Telegram), Resultado, Notas.

### 7. Registro de Plataformas/Ventas (Panel expandible)

En la tab Confirmadas, cada fila tiene un botón expandible que muestra `PlatformSalesPanel`:
- Lista de ventas (plataforma, producto, precio)
- Botón agregar venta
- Los totales se suman al dashboard

### 8. Timeline de Actividad (en `ViewCreatorModal.tsx`)

Agregar una línea de tiempo vertical dentro del modal existente que muestre cronológicamente: Asignada → Contactos → Confirmación → Completado. Datos de `closer_creators` + `closer_contact_history`.

### 9. Botón Asignar (solo admin)

En la tab Asignadas, mostrar botón "Asignar" solo si el usuario es admin. Reutilizar `AssignCloserDialog` existente.

### 10. Visibilidad por Rol

En el hook principal, closers (`!isAdmin && !isManager`) solo ven creators donde `assigned_to = user.id`. Admin ve todo. Esto ya existe en `useCloserCreators.ts`, se replica en el hook refactorizado.

---

### Archivos a crear
- `src/pages/closers/components/PlatformSalesPanel.tsx` — Registro de ventas por plataforma
- `src/pages/closers/components/ActivityTimeline.tsx` — Timeline vertical en el modal
- `src/pages/closers/components/ContactQuickForm.tsx` — Popover para registrar contacto desde la tabla

### Archivos a modificar
- `src/pages/closers/ClosersContent.tsx` — Simplificar tabs a 5, ajustar layout
- `src/pages/closers/hooks/useCloserLeads.ts` — Migrar de `leadgen_entries` a `closer_creators`, agregar joins, cálculos de contacto y revenue
- `src/pages/closers/components/ClosersKPICards.tsx` — Nuevas KPIs con revenue por plataforma
- `src/pages/closers/components/LeadTable.tsx` — Columnas dinámicas según tab activo, alertas de contacto, campos financieros editables
- `src/pages/closers/components/ViewCreatorModal.tsx` — Agregar timeline de actividad
- `src/pages/closers/useCloserCreators.ts` — Actualizar stages a los 4 definidos
- `src/pages/closers/useContactHistory.ts` — Agregar cálculo de próxima fecha de contacto

### Archivos legacy a eliminar
- `src/pages/closers/tabs/PipelineTab.tsx`
- `src/pages/closers/tabs/MisCreatorsTab.tsx`
- `src/pages/closers/tabs/AsignacionTab.tsx`
- `src/pages/closers/tabs/ConfirmadasTab.tsx`
- `src/pages/closers/tabs/CompletadasTab.tsx`
- `src/pages/closers/tabs/NoInteresadasTab.tsx`

### Migración SQL
```sql
ALTER TABLE closer_creators ADD COLUMN IF NOT EXISTS main_platform text;
ALTER TABLE closer_creators ADD COLUMN IF NOT EXISTS extras numeric DEFAULT 0;

CREATE TABLE closer_platform_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid REFERENCES closer_creators(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  product text,
  price numeric DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE closer_platform_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on platform sales" ON closer_platform_sales
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Closers see own platform sales" ON closer_platform_sales
  FOR ALL TO authenticated
  USING (
    creator_id IN (
      SELECT id FROM closer_creators WHERE assigned_to = auth.uid()
    )
  );
```

