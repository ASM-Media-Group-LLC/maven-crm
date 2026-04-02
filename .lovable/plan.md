

## Plan: Módulo "Proyecto Cuentas Propias" — `/proyectomp`

### Resumen
Módulo completo de seguimiento de plan de negocio con 8 secciones, tablas nuevas en Supabase, permiso "ProyectoMP" en el sistema RBAC existente, y navegación integrada en el sidebar.

---

### Base de datos — Tablas nuevas (prefijo `mp_`)

**`mp_phases`** — Las 3 fases del proyecto
- id, name, phase_number (1-3), start_date, end_date, description, status (planned/active/completed)

**`mp_tasks`** — Kanban de tareas
- id, title, description, phase_id (FK), pillar (enum: recruiting/ai/modelo/trafico/operaciones/general), status (todo/in_progress/blocked/completed), priority (high/medium/low), assigned_to (uuid FK profiles), due_date, position (int para orden), created_by, created_at, updated_at

**`mp_candidates`** — Pipeline de recruiting
- id, name, photo_url, city, contact_date, notes, stage (enum: candidata/contactada/entrevista/filtro/shooting/contrato/activa/inactiva), estimated_tier (text), position (int), created_by, created_at, updated_at

**`mp_candidate_checklist`** — Checklist por candidata
- id, candidate_id (FK), item_key (text: fotos_recibidas, entrevista_completada, etc.), completed (bool), completed_at, completed_by

**`mp_models`** — Modelos activas (vinculadas desde pipeline)
- id, candidate_id (FK nullable), name, account_url, status (active/paused/inactive), created_at

**`mp_content_entries`** — Tracker de contenido
- id, model_id (FK), content_type (enum: ai_social/ai_perfil/ai_premium/modelo_video/modelo_custom/modelo_intimo), source (ai/modelo), quantity (int), date, notes, created_by

**`mp_content_sessions`** — Sesiones en apartamento
- id, model_id (FK), scheduled_at (timestamptz), status (scheduled/completed/cancelled), notes

**`mp_traffic_organic`** — Tráfico orgánico
- id, model_id (FK), platform, posts_count, engagement, clicks, subs_generated, date, created_by

**`mp_traffic_sfs`** — Intercambios SFS
- id, model_id (FK), partner_name, partner_handle, date, result, subs_generated, status (pending/done), notes

**`mp_traffic_paid`** — Tráfico pagado
- id, model_id (FK), creator_contacted, amount_invested (numeric), subs_obtained (int), cpa (numeric computed), date, notes, created_by

**`mp_financials`** — P&L por cuenta
- id, model_id (FK), month (date), revenue (numeric), cost_chatters, cost_content, cost_traffic, cost_other, notes

**`mp_team_members`** — Equipo del proyecto
- id, name, role, salary (numeric), start_date, status (hired/searching/pending), accounts_assigned (text[]), created_at

**`mp_team_plan`** — Plan de contratación por mes
- id, month_target (int), headcount_target (int), notes

**`mp_milestones`** — Milestones y KPIs
- id, title, description, completed (bool), completed_at, position (int), phase_id (FK nullable)

RLS: todas las tablas con `authenticated` access, filtrado por permiso "ProyectoMP" en frontend via `PermissionRoute`. Políticas: SELECT/INSERT/UPDATE/DELETE para authenticated + bypass admin via `has_role(auth.uid(), 'admin')`.

Seed data: las tareas pre-cargadas de las 3 fases y los milestones se insertan en la migración.

---

### Permisos
- Agregar módulo "ProyectoMP" en `role_permissions` para el rol admin (INSERT de datos)
- Frontend: rutas envueltas en `<PermissionRoute module="ProyectoMP">`

---

### Estructura de archivos

```text
src/pages/proyectomp/
├── ProyectoMPLayout.tsx          # Layout con sidebar interno del módulo
├── ProyectoMPDashboard.tsx       # Dashboard principal
├── ProyectoMPTareas.tsx          # Kanban de tareas
├── ProyectoMPPipeline.tsx        # Pipeline de recruiting
├── ProyectoMPContenido.tsx       # Tracker de contenido
├── ProyectoMPTrafico.tsx         # Tracker de tráfico
├── ProyectoMPFinanzas.tsx        # P&L y financiero
├── ProyectoMPEquipo.tsx          # Equipo del proyecto
├── ProyectoMPMilestones.tsx      # Milestones y KPIs
├── hooks/
│   ├── useMPTasks.ts
│   ├── useMPCandidates.ts
│   ├── useMPModels.ts
│   ├── useMPContent.ts
│   ├── useMPTraffic.ts
│   ├── useMPFinancials.ts
│   ├── useMPTeam.ts
│   └── useMPMilestones.ts
└── components/
    ├── MPSidebar.tsx             # Sidebar interno del módulo
    ├── MPPhaseTimeline.tsx        # Timeline visual de fases
    ├── MPKanbanBoard.tsx          # Board drag & drop
    ├── MPPipelineBoard.tsx        # Pipeline drag & drop
    ├── MPContentCalendar.tsx
    ├── MPTrafficTable.tsx
    ├── MPFinancialChart.tsx
    └── MPTeamPlanChart.tsx
```

---

### Navegación
- Agregar "Proyecto MP" al `DashboardSidebar.tsx` en el menú principal con icono `Rocket` (o similar)
- Subrutas internas manejadas por `MPSidebar` dentro del layout del módulo

### Rutas en App.tsx
```
/proyectomp                → Dashboard
/proyectomp/tareas         → Kanban
/proyectomp/pipeline       → Pipeline recruiting
/proyectomp/contenido      → Tracker contenido
/proyectomp/trafico        → Tracker tráfico
/proyectomp/finanzas       → Financiero
/proyectomp/equipo         → Equipo
/proyectomp/milestones     → Milestones
```

---

### Diseño
- Dark mode consistente con el CRM existente (usa theme tokens existentes, no colores hardcoded)
- Cards con borde teal para secciones activas
- Colores de estado: teal (#0D9488) progreso, rojo (#E94560) bloqueado/alerta, verde (#10B981) completado, dorado (#F59E0B) warning
- Drag & drop con `@hello-pangea/dnd` (fork mantenido de react-beautiful-dnd, ya compatible con React 18)
- Recharts para gráficas de P&L y timeline
- Mobile responsive con sidebar colapsable

---

### Orden de implementación
1. Migración DB (todas las tablas + seed data de tareas/milestones + permisos)
2. Layout + Sidebar interno + rutas en App.tsx + sidebar principal
3. Dashboard con métricas, timeline de fases, alertas
4. Kanban de tareas con drag & drop y filtros
5. Pipeline de recruiting con drag & drop y checklist
6. Tracker de contenido por modelo
7. Tracker de tráfico (3 tabs: orgánico, SFS, pagado)
8. Financiero con P&L y gráficas
9. Equipo con plan de contratación
10. Milestones con checkboxes y KPIs

### Impacto en código existente
- `App.tsx` — agregar ~10 rutas nuevas con `PermissionRoute`
- `DashboardSidebar.tsx` — agregar entrada "Proyecto MP" al menú
- **No se tocan tablas existentes** — todo es tablas nuevas con prefijo `mp_`

