-- El Drive full como ADENDUM por persona (Alvaro, 05/11): además de admin,
-- manager y coordinadores (que lo tienen por su nivel/rol), un admin puede dar
-- "acceso total al Drive del NAS" a cualquier persona suelta —sin cambiarle el
-- puesto ni el nivel— metiéndola en esta lista. Ej.: Brayan Castaño, que es
-- agente pero debe ver y manejar todo el NAS.

create table if not exists public.drive_acceso_extra (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  nota       text,
  created_at timestamptz not null default now()
);

alter table public.drive_acceso_extra enable row level security;
drop policy if exists "ver acceso extra drive" on public.drive_acceso_extra;
create policy "ver acceso extra drive" on public.drive_acceso_extra
  for select to authenticated
  using (
    public.es_dueno((select auth.uid()))
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.nivel in ('dueno', 'admin'))
  );
revoke insert, update, delete on public.drive_acceso_extra from authenticated, anon;
grant select on public.drive_acceso_extra to authenticated;

-- drive_acceso_total: ahora también mira la lista de adendum.
create or replace function public.drive_acceso_total()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.deleted_at is null
      and p.nivel in ('dueno', 'admin', 'manager')
  ) or exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('Coordinador', 'Coordinador Supervisor')
  ) or exists (
    select 1 from public.drive_acceso_extra e
    where e.user_id = auth.uid()
  )
$function$;