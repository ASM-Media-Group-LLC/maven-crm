

## Plan: Creator Offboarding System + Remove Casting Module

### Part 1: Remove Casting (Prospectos) Submenu

**Files to modify:**
- `src/components/dashboard/DashboardSidebar.tsx` — Remove `{ title: "Casting", url: "/creadores/prospectos" }` from `creadoresSubItems`
- `src/App.tsx` — Remove the `/creadores/prospectos` route and `ProspectosPage` import

**Files to keep (no delete):** The `prospectos/` folder and `creator_prospects` table remain untouched to preserve historical data. They simply become unreachable from the UI.

---

### Part 2: Database — `creator_offboardings` Table

New migration to create:

```sql
create table public.creator_offboardings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators(id) on delete cascade not null,
  status text not null default 'en_proceso'
    check (status in ('en_proceso','pendiente_aprobacion','pendiente_cierre','finalizado')),
  
  -- Exit info
  exit_date date,
  motivo_operativo text,
  motivo_comercial text,
  motivo_final text,
  categoria text,
  comentarios text,
  
  -- Checklist
  check_pagos boolean default false,
  check_material boolean default false,
  check_campanas boolean default false,
  check_accesos boolean default false,
  check_documentacion boolean default false,
  
  -- Financial impact
  last_revenue numeric,
  avg_monthly_revenue numeric,
  estimated_lost_revenue numeric,
  
  -- Communication
  comunicado_generado text,
  
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.creator_offboardings enable row level security;

create policy "Authenticated users can manage offboardings"
  on public.creator_offboardings for all to authenticated
  using (true) with check (true);

-- Approvals table (max 3 approvers, need 2)
create table public.creator_offboarding_approvals (
  id uuid primary key default gen_random_uuid(),
  offboarding_id uuid references public.creator_offboardings(id) on delete cascade not null,
  approver_id uuid references auth.users(id) not null,
  approved boolean default false,
  approved_at timestamptz,
  created_at timestamptz default now(),
  unique(offboarding_id, approver_id)
);

alter table public.creator_offboarding_approvals enable row level security;

create policy "Authenticated users can manage offboarding approvals"
  on public.creator_offboarding_approvals for all to authenticated
  using (true) with check (true);
```

---

### Part 3: Offboarding Section in Creator Profile

**New file: `src/pages/creadores/OffboardingSection.tsx`**

A collapsible section rendered in `CreadorProfileContent.tsx` below the `VerificationSection`, visible only when creator status is `leaving` or `terminated` (and for admin/manager roles).

UI structure (single scrollable page, card-based):

1. **Creator Summary Card** — Name, artistic name, Instagram, exit date
2. **Exit Information Card** — Motivo Operativo, Motivo Comercial, Motivo Final (textareas), Categoria (dropdown: Voluntaria, Involuntaria, Mutuo Acuerdo, Incumplimiento, Otro), Comentarios
3. **Approvals Card** — 3 fixed approver slots. Visual badges showing approved/pending. Only designated approvers see the "Aprobar" button. Shows "2 de 3 requeridas" progress.
4. **Closure Checklist Card** — 5 checkboxes with labels, progress bar
5. **Financial Impact Card** — 3 metric cards: Last Revenue, Avg Monthly, Estimated Lost Revenue (auto-calculated from `creator_monetization` data)
6. **Generate Communication Button** — Builds a formatted text block with all offboarding data, copyable to clipboard

**New file: `src/pages/creadores/useOffboarding.ts`** — React Query hooks for CRUD on `creator_offboardings` and `creator_offboarding_approvals`, plus auto-calculation of financial impact from `creator_monetization`.

**Modified: `src/pages/creadores/CreadorProfileContent.tsx`**
- Import and render `OffboardingSection` when status is `leaving` or `terminated`
- When status changes to `leaving` via `ChangeStatusModal`, auto-create an offboarding record

**Modified: `src/pages/creadores/ChangeStatusModal.tsx`**
- When new status is `leaving`, automatically insert a `creator_offboardings` row

---

### Part 4: Dashboard Metrics Integration

**Modified: `src/pages/creadores/CreadorasDashboardContent.tsx`**

Add a new section at the bottom: "Offboarding Metrics"
- **Modelos perdidas** (count of `finalizado` offboardings)
- **Revenue perdido** (sum of `estimated_lost_revenue`)
- **Motivos de salida** (breakdown by `categoria`)

Uses existing KPI card design standard with hover effects and colored badges.

---

### Summary of Files

| Action | File |
|--------|------|
| Modify | `src/components/dashboard/DashboardSidebar.tsx` |
| Modify | `src/App.tsx` |
| Create | `src/pages/creadores/OffboardingSection.tsx` |
| Create | `src/pages/creadores/useOffboarding.ts` |
| Modify | `src/pages/creadores/CreadorProfileContent.tsx` |
| Modify | `src/pages/creadores/ChangeStatusModal.tsx` |
| Modify | `src/pages/creadores/CreadorasDashboardContent.tsx` |
| Migration | `creator_offboardings` + `creator_offboarding_approvals` tables |

