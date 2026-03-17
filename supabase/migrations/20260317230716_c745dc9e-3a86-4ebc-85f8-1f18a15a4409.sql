-- Creator Offboardings table
create table public.creator_offboardings (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators(id) on delete cascade not null,
  status text not null default 'en_proceso'
    check (status in ('en_proceso','pendiente_aprobacion','pendiente_cierre','finalizado')),
  exit_date date,
  motivo_operativo text,
  motivo_comercial text,
  motivo_final text,
  categoria text,
  comentarios text,
  check_pagos boolean default false,
  check_material boolean default false,
  check_campanas boolean default false,
  check_accesos boolean default false,
  check_documentacion boolean default false,
  last_revenue numeric,
  avg_monthly_revenue numeric,
  estimated_lost_revenue numeric,
  comunicado_generado text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.creator_offboardings enable row level security;

create policy "Authenticated users can manage offboardings"
  on public.creator_offboardings for all to authenticated
  using (true) with check (true);

-- Offboarding Approvals table
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