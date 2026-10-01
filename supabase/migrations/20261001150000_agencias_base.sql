-- AGENCIAS, LA BASE: una persona es de UNA agencia, la cuenta nueva ya no cae
-- sola en asm-tech, y existe el super admin de la plataforma.
-- Plan «Maven Basic: plan de lanzamiento», fase 0 (aislamiento), primera entrega.
-- Banco: supabase/tests/agencias_base.ts.
--
-- Qué cambia:
--   1. tenant_members_una_agencia: UNIQUE (user_id). Decisión de Jhon (01/10):
--      una persona pertenece a una sola agencia, y quien trabaje para dos usa
--      dos cuentas. En prod son 82 personas y 82 membresías, todas en asm-tech;
--      el DO de abajo falla si alguien está en dos.
--      Con una sola membresía, current_tenant_id() deja de depender de «la más
--      vieja». Se cierra el «límite conocido» de 20260930230000 (alguien en dos
--      agencias no podía abrir un directo con quien estaba solo en una).
--   2. handle_new_user deja de meter a toda cuenta nueva en asm-tech. La agencia
--      la pone admin-user-actions, por donde pasan todas las altas legítimas: la
--      de quien crea la cuenta, y si no queda puesta, deshace el alta.
--      ⚠️ POR QUÉ NO LA PONE LA BASE: GoTrue no escribe app_metadata en el mismo
--      INSERT de auth.users. El 04/09 un trigger que lo leía rechazó TODAS las
--      altas durante 18 h (20260904230000). user_metadata sí llega en el INSERT,
--      pero lo escribe quien se registra, así que tampoco sirve para elegir agencia.
--      Efecto bueno de paso: una cuenta del registro público (que el 01/10 sigue
--      ABIERTO en prod: disable_signup=false) ya no entra a ninguna agencia.
--      Sigue recibiendo el rol 'employee'; eso se va con los roles por agencia.
--   3. plataforma_admins + es_admin_de_plataforma(): el super admin, por encima de
--      las agencias. Decisión de Jhon: solo jhon.lopez@maven-ai.me. Hoy no abre
--      nada; lo va a usar el panel de plataforma (fase 1), desde el servidor.
--      La tabla no se lee ni se escribe por la API (RLS sin políticas y sin
--      privilegios); la función solo responde por quien llama.
--
-- Orden de despliegue: da igual. admin-user-actions inserta la membresía con ON
-- CONFLICT DO NOTHING y relee: anda con el handle_new_user viejo (que ya puso
-- asm-tech, la agencia de quien crea mientras haya una sola) y con este.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| alter table public.tenant_members drop constraint if exists tenant_members_una_agencia;
--| drop function if exists public.es_admin_de_plataforma();
--| drop table if exists public.plataforma_admins;
--| create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path to 'public' as $function$
--| declare default_tenant_id uuid;
--| begin
--|   insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data->>'full_name') on conflict (id) do nothing;
--|   insert into public.user_roles (user_id, role) values (new.id, 'employee') on conflict do nothing;
--|   select id into default_tenant_id from public.tenants where slug = 'asm-tech' and active = true limit 1;
--|   if default_tenant_id is not null then
--|     insert into public.tenant_members (user_id, tenant_id, role) values (new.id, default_tenant_id, 'member') on conflict (user_id, tenant_id) do nothing;
--|   end if;
--|   return new;
--| end;
--| $function$;

-- ─── 1. Una persona, una agencia ────────────────────────────────────────────
do $$
declare
  dobles int;
begin
  select count(*) into dobles
  from (select user_id from public.tenant_members group by user_id having count(*) > 1) d;
  if dobles > 0 then
    raise exception 'agencias_base: % persona(s) en más de una agencia; hay que dejar a cada una en una sola antes de aplicar esto', dobles;
  end if;
end $$;

alter table public.tenant_members
  add constraint tenant_members_una_agencia unique (user_id);

comment on constraint tenant_members_una_agencia on public.tenant_members is
  'Una persona pertenece a una sola agencia (decisión de Jhon, 01/10/2026). Quien trabaje para dos usa dos cuentas.';

-- ─── 2. El alta ya no elige agencia ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- 1. Perfil
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  -- 2. Rol
  insert into public.user_roles (user_id, role)
  values (new.id, 'employee')
  on conflict do nothing;

  -- 3. La agencia NO se pone aquí: la pone admin-user-actions (la de quien crea
  --    la cuenta). Ver la cabecera de 20261001150000_agencias_base.
  return new;
end;
$function$;

-- ─── 3. El super admin de la plataforma ─────────────────────────────────────
create table public.plataforma_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.plataforma_admins is
  'Super admins de la plataforma Maven, por encima de las agencias. No se lee ni se escribe por la API: se consulta con es_admin_de_plataforma().';

alter table public.plataforma_admins enable row level security;
revoke all on table public.plataforma_admins from public, anon, authenticated;

create function public.es_admin_de_plataforma()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from public.plataforma_admins where user_id = auth.uid())
$$;

comment on function public.es_admin_de_plataforma() is
  'true si quien llama es super admin de la plataforma. Solo responde por quien llama (sin argumentos).';

revoke all on function public.es_admin_de_plataforma() from public, anon;
grant execute on function public.es_admin_de_plataforma() to authenticated, service_role;

insert into public.plataforma_admins (user_id)
select id from auth.users where lower(email) = 'jhon.lopez@maven-ai.me'
on conflict (user_id) do nothing;
