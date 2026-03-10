

## Closers Module Overhaul -- Creator Closing Management

### Overview
Replace the current simple deals CRUD with a full creator-closing pipeline. New DB tables `closer_creators` and `closer_contact_history`, RLS for closer-only visibility, and a tabbed UI following the module-layout-standard.

---

### 1. Database Migration

**Table: `closer_creators`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| instagram_handle | text NOT NULL | |
| category | text | Latina, Fitness, etc. |
| passed_date | date | Fecha de paso from LeadGen |
| source_account | text | Cuenta origen |
| phone | text | |
| notes | text | |
| onlyfans_url | text | |
| estimated_monetization | numeric(12,2) | default 0 |
| agency_commission | numeric(5,2) | percentage, default 0 |
| stage | text | default 'Asignada' |
| assigned_to | uuid | FK auth.users (closer) |
| rejection_reason | text | |
| confirmed_date | timestamptz | |
| completed_date | timestamptz | |
| last_contact_date | timestamptz | |
| monthly_monetization | numeric(12,2) | for completed |
| leadgen_entry_id | uuid | FK leadgen_entries |
| created_by | uuid | FK auth.users |
| company_id | uuid | FK companies |
| created_at / updated_at | timestamptz | |

**Stages**: Asignada, En negociación, Formulario enviado, Acuerdo enviado, Confirmada, Completada, No interesada

**Table: `closer_contact_history`**
- id, creator_id (FK closer_creators), contact_date, channel, result, notes, created_by

**Triggers**:
- Block insert if creator already has 6 contact records
- Auto-update `last_contact_date` on closer_creators when contact inserted

**RLS**:
- Closers: SELECT/UPDATE where `assigned_to = auth.uid()`
- Admins: full CRUD (via `has_role`)

---

### 2. Frontend Files

All under `src/pages/closers/`:

**Delete**: All existing files (ClosersContent, ClosersGrid, ClosersTable, ClosersKPICards, useDeals, *DealModal*, DeleteDealDialog)

**Create**:

| File | Purpose |
|------|---------|
| `useCloserCreators.ts` | Hook: paginated fetch, CRUD, stage changes, role-based filtering |
| `useContactHistory.ts` | Hook: fetch/add contact history (max 6 enforcement) |
| `ClosersContent.tsx` | Main layout with tab navigation (7 tabs) |
| `tabs/ClosersDashboard.tsx` | KPI cards: Asignadas, En negociación, Confirmadas, Completadas, Monetización total, Revenue agencia |
| `tabs/MisCreatorsTab.tsx` | Full table with all specified columns, filtered by assigned_to for closers |
| `tabs/PipelineTab.tsx` | All creators grouped/filtered by stage |
| `tabs/ConfirmadasTab.tsx` | Table: Instagram, Closer, Fecha confirmación, Monetización, Comisión, Revenue |
| `tabs/CompletadasTab.tsx` | Table: Instagram, Closer, Fecha completada, Monetización mensual, Revenue, Notas |
| `tabs/NoInteresadasTab.tsx` | Table: Instagram, Closer, Fecha último contacto, Motivo rechazo, Comentario |
| `tabs/AsignacionTab.tsx` | Admin-only: assign/reassign creators to closers |
| `components/CreatorTable.tsx` | Reusable sortable table |
| `components/NewCreatorModal.tsx` | Create creator dialog |
| `components/EditCreatorModal.tsx` | Edit creator dialog |
| `components/ViewCreatorModal.tsx` | Detail view with contact history panel |
| `components/ContactHistoryPanel.tsx` | List + add form, counter "3/6 contactos", disabled at 6 |
| `components/DeleteCreatorDialog.tsx` | Confirm delete |
| `components/AssignCloserDialog.tsx` | Admin: assign closer dropdown |
| `components/ClosersKPICards.tsx` | Dashboard KPI cards |

**Visibility logic** in `useCloserCreators.ts`:
- Uses `useUserRole()` -- closers query with `.eq('assigned_to', user.id)`, admins query all

**Revenue auto-calculation** (client-side):
- `estimated_revenue = estimated_monetization * (agency_commission / 100)`

**3-day reminder**: Red badge on creators where `now() - last_contact_date > 3 days`, computed client-side

**Tab visibility**: "Asignación" tab only rendered when `isAdmin` is true

---

### 3. Unchanged
- `src/pages/Closers.tsx` wrapper stays as-is
- Old `deals` table left in DB (no destructive migration)
- Sidebar, permissions, routing all remain the same

