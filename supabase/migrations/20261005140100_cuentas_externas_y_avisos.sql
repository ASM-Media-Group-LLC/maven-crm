-- CUENTAS EXTERNAS Y AVISOS: dos huecos más antes del portal de creadoras.
-- Banco: supabase/tests/creadoras_por_agencia.ts (secciones 5 y 6).
-- Requiere 20261001210000_agencias_base y 20261001212000_personas_por_agencia
-- (gente_de_mi_agencia), ya en prod.
--
-- 1. Una cuenta externa no recibe rol de empleado.
--    handle_new_user le daba user_roles = 'employee' a TODA cuenta nueva de
--    auth.users. Las creadoras van a entrar con su correo personal y no son
--    empleadas. La marca es app_metadata.tipo = 'creadora' (raw_app_meta_data):
--    solo la pone el servidor (service_role); quien se registra no la puede
--    escribir.
--    ⚠️ GoTrue NO escribe app_metadata en el mismo INSERT de auth.users: lo
--    escribe con un UPDATE posterior, en la misma transacción (por eso el
--    candado de 20260904220000 rechazó todas las altas durante 18 h). Así que:
--    · handle_new_user no da el rol si la marca ya viene en el INSERT (un alta
--      por SQL, o un GoTrue futuro que la mande junta);
--    · cuenta_externa_sin_rol (AFTER UPDATE OF raw_app_meta_data, solo cuando
--      la marca APARECE) le saca los roles que tenga: es el caso de
--      auth.admin.createUser({ app_metadata: { tipo: 'creadora' } }) y el de
--      marcar después una cuenta ya creada;
--    · user_roles_no_a_cuentas_externas: a una cuenta marcada no se le puede
--      poner un rol después (admin-user-actions, manage-user-roles, SQL).
--    El alta normal de empleados (admin-user-actions → create_user, que manda
--    app_metadata { alta: 'admin' }) sigue igual: perfil + 'employee' al
--    INSERT, la marca nunca aparece, y el rol que elija quien crea se pone
--    después como siempre. El banco la reproduce paso a paso, como lo hace
--    GoTrue (INSERT y después UPDATE de app_metadata, en una transacción).
--    El perfil (profiles) se sigue creando para toda cuenta: hay claves
--    foráneas que lo suponen. Una cuenta de creadora no tiene que entrar a
--    tenant_members (sería «gente de la agencia»: la verían en el directorio).
--
-- 2. Nadie le crea avisos a gente de otra agencia, ni con enlaces de afuera.
--    La política de INSERT de notifications era WITH CHECK (true): cualquier
--    sesión le creaba a CUALQUIER persona un aviso con el título, el texto y el
--    enlace que quisiera, y push_desde_notificacion se lo mandaba como push al
--    teléfono (un enlace https://… o //… abre otro sitio: phishing). También
--    podía mandar uno «por rol» (user_id NULL + role_target) a todos los
--    admins de todas las agencias, o ocupar de antemano el automation_key de
--    un aviso automático para que no saliera.
--    Lo que se eligió: la misma política, más estrecha, en vez de pasar todo
--    a una función. Desde el navegador se crean avisos en 5 lugares legítimos
--    (evaluador de chatters, onboarding ×2, inactividad de onboarding,
--    anuncios de RRHH): todos van a gente de la misma agencia, con un enlace
--    relativo, sin role_target ni automation_key. Con esta política siguen
--    funcionando sin tocar el frontend ni el orden de despliegue. Los avisos
--    de la base (notify_chat_message, notify_closer_on_assignment,
--    check_closer_contact_alerts: SECURITY DEFINER) y de las edges
--    (mail-fetch, con service_role) no pasan por la RLS y no cambian.
--    Desde el navegador, ahora:
--      · user_id: alguien de la agencia de quien lo crea (gente_de_mi_agencia);
--        ya no se puede NULL;
--      · role_target y automation_key: vacíos (solo los pone la base);
--      · deep_link_url: vacío, o relativo: empieza con «/», el segundo carácter
--        no es «/» ni «\», y no tiene caracteres de control (el navegador
--        borra tabulaciones y saltos: «/\t/sitio» terminaría en «//sitio»).
--    Lo que queda: alguien de la agencia puede mandarle a un compañero un aviso
--    con texto libre (ya puede escribirle por el Messenger). Tres llamadas del
--    frontend crean avisos con user_id NULL (VerificationSection ×2,
--    OnboardingWizard al terminar): nunca los vio nadie (ninguna política de
--    SELECT los muestra) y ahora la base no los guarda; la app no mira ese
--    error, así que nada cambia para quien usa la pantalla.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| do $$ declare r record; begin for r in select def from public.cuentas_externas_respaldo order by fn loop execute r.def; end loop; end $$;
--| drop table public.cuentas_externas_respaldo;
--| drop trigger cuenta_externa_sin_rol on auth.users;
--| drop function public.cuenta_externa_sin_rol();
--| drop trigger user_roles_no_a_cuentas_externas on public.user_roles;
--| drop function public.user_roles_no_a_cuentas_externas();
--| alter policy "Avisos: solo a gente de mi agencia" on public.notifications rename to "Authenticated users can insert notifications";
--| alter policy "Authenticated users can insert notifications" on public.notifications with check (true);

-- ─── 0. Lo revisado es lo que hay ───────────────────────────────────────────
create table public.cuentas_externas_respaldo (fn text primary key, def text not null, guardada timestamptz not null default now());
alter table public.cuentas_externas_respaldo enable row level security;
revoke all on table public.cuentas_externas_respaldo from public, anon, authenticated;
comment on table public.cuentas_externas_respaldo is
  'Definiciones de antes de 20261005140100_cuentas_externas_y_avisos, para su vuelta atrás. Sin políticas.';

do $$
declare
  h text := (select md5(prosrc) from pg_proc where oid = 'public.handle_new_user()'::regprocedure);
begin
  if h is distinct from '5d68682c40afb082e32cbdd86660327f' then
    raise exception 'cuentas_externas_y_avisos: handle_new_user no es la que se revisó (huella %): mira qué cambió antes de aplicar', h;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications'
                 and policyname = 'Authenticated users can insert notifications' and cmd = 'INSERT' and with_check = 'true') then
    raise exception 'cuentas_externas_y_avisos: la política de INSERT de notifications no es la que se revisó';
  end if;
  insert into public.cuentas_externas_respaldo (fn, def)
  values ('public.handle_new_user()', pg_get_functiondef('public.handle_new_user()'::regprocedure));
end $$;

-- ─── 1. Una cuenta externa no recibe rol de empleado ────────────────────────
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

  -- 2. Rol: solo las cuentas de la agencia. Una cuenta externa (app_metadata.tipo
  --    'creadora', que pone solo el servidor) no lleva rol de empleado. GoTrue
  --    escribe app_metadata después del INSERT: ese caso lo cubre
  --    cuenta_externa_sin_rol (20261005140100).
  if coalesce(new.raw_app_meta_data->>'tipo', '') <> 'creadora' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'employee')
    on conflict do nothing;
  end if;

  -- 3. La agencia NO se pone aquí: la pone admin-user-actions (la de quien crea
  --    la cuenta). Ver la cabecera de 20261001210000_agencias_base.
  return new;
end;
$function$;

create function public.cuenta_externa_sin_rol()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from public.user_roles where user_id = new.id;
  return null;
end $$;

comment on function public.cuenta_externa_sin_rol() is
  'Cuando una cuenta de auth.users queda marcada como externa (app_metadata.tipo = creadora), le saca los roles de la agencia. GoTrue escribe app_metadata en un UPDATE después del INSERT.';

revoke all on function public.cuenta_externa_sin_rol() from public, anon, authenticated;

create trigger cuenta_externa_sin_rol
  after update of raw_app_meta_data on auth.users
  for each row
  when ((new.raw_app_meta_data ->> 'tipo') = 'creadora' and (old.raw_app_meta_data ->> 'tipo') is distinct from 'creadora')
  execute function public.cuenta_externa_sin_rol();

create function public.user_roles_no_a_cuentas_externas()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if exists (select 1 from auth.users u where u.id = new.user_id and (u.raw_app_meta_data ->> 'tipo') = 'creadora') then
    raise exception 'user_roles: la cuenta % es externa (creadora) y no lleva rol de la agencia', new.user_id
      using errcode = '42501';
  end if;
  return new;
end $$;

comment on function public.user_roles_no_a_cuentas_externas() is
  'Una cuenta marcada como externa (app_metadata.tipo = creadora) no puede tener rol en user_roles.';

revoke all on function public.user_roles_no_a_cuentas_externas() from public, anon, authenticated;

create trigger user_roles_no_a_cuentas_externas
  before insert or update of user_id, role on public.user_roles
  for each row execute function public.user_roles_no_a_cuentas_externas();

-- ─── 2. Avisos: solo a gente de mi agencia, con enlaces de Maven ────────────
alter policy "Authenticated users can insert notifications" on public.notifications
  with check (
    user_id is not null
    and user_id in (select public.gente_de_mi_agencia())
    and role_target is null
    and automation_key is null
    and (deep_link_url is null
         or (deep_link_url ~ '^/([^/\\]|$)' and deep_link_url !~ '[[:cntrl:]]'))
  );
alter policy "Authenticated users can insert notifications" on public.notifications
  rename to "Avisos: solo a gente de mi agencia";
