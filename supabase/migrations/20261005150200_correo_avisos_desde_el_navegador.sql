-- CORREOS DE AVISO PEDIDOS DESDE EL NAVEGADOR (edge send-notification-email).
-- Banco: supabase/tests/seguridad_archivos.ts. La edge: send-notification-email/logica.ts.
--
-- Hasta hoy cualquier cuenta con sesión mandaba HTML libre a cualquier dirección
-- desde noreply@mail.maven-ai.me, y con also_include_user_ids averiguaba el
-- correo de quien quisiera (llegaba en el «Para» del mismo correo). Desde el
-- navegador ahora solo se pide «manda el reporte X» (plantilla + id): la edge
-- lee el reporte con la RLS de la persona, arma el correo con la plantilla y
-- elige a quién mandarlo. Lo que necesita de la base:
--
--   1. correo_destinatarios_de_agencia(quien, user_ids, correos): de esos ids y
--      de esas direcciones, solo las cuentas de Maven de la MISMA agencia que
--      quien pide (la primera agencia de la persona, como current_tenant_id).
--      Nunca una dirección suelta.
--   2. correo_navegador_turno(quien, plantilla, ref): el tope, 5 pedidos por
--      minuto por persona, y el registro de cada pedido (quién, qué reporte,
--      cuándo). Con un candado por persona para que dos pedidos a la vez no
--      pasen los dos el tope.
-- Las dos son solo de service_role: las llama la edge, nunca el navegador.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop function public.correo_navegador_turno(uuid, text, text);
--| drop function public.correo_destinatarios_de_agencia(uuid, uuid[], text[]);
--| drop table public.correo_envios_navegador;

create table public.correo_envios_navegador (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  plantilla text not null,
  ref text not null,
  created_at timestamptz not null default now()
);
create index correo_envios_navegador_persona_idx on public.correo_envios_navegador (user_id, created_at desc);
alter table public.correo_envios_navegador enable row level security;
revoke all on table public.correo_envios_navegador from public, anon, authenticated;
comment on table public.correo_envios_navegador is
  'Cada correo de aviso pedido desde el navegador (send-notification-email, modo plantilla): para el tope por minuto y para saber quién pidió qué. Sin políticas: solo service_role.';

create or replace function public.correo_navegador_turno(p_user uuid, p_plantilla text, p_ref text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tope constant int := 5;
  v_recientes int;
begin
  if p_user is null then
    return false;
  end if;
  -- Un pedido a la vez por persona: sin esto, dos pedidos simultáneos cuentan
  -- los dos «4 en el último minuto» y pasan los dos.
  perform pg_advisory_xact_lock(hashtextextended('correo_navegador_turno:' || p_user::text, 0));
  select count(*) into v_recientes
  from public.correo_envios_navegador
  where user_id = p_user and created_at > now() - interval '1 minute';
  if v_recientes >= v_tope then
    return false;
  end if;
  insert into public.correo_envios_navegador (user_id, plantilla, ref) values (p_user, p_plantilla, p_ref);
  return true;
end
$$;
revoke all on function public.correo_navegador_turno(uuid, text, text) from public, anon, authenticated;
grant execute on function public.correo_navegador_turno(uuid, text, text) to service_role;
comment on function public.correo_navegador_turno(uuid, text, text) is
  'Tope de correos de aviso pedidos desde el navegador: 5 por minuto por persona. true = puede mandar (y queda anotado). Solo service_role.';

create or replace function public.correo_destinatarios_de_agencia(p_quien uuid, p_user_ids uuid[], p_correos text[])
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = public
as $$
  with agencia as (
    select tm.tenant_id from public.tenant_members tm
    where tm.user_id = p_quien
    order by tm.created_at asc
    limit 1
  ),
  pedidos as (
    select lower(btrim(c)) as correo from unnest(coalesce(p_correos, '{}'::text[])) as c
  )
  select distinct u.id, lower(u.email)::text
  from auth.users u
  join public.tenant_members tm on tm.user_id = u.id and tm.tenant_id = (select tenant_id from agencia)
  where u.email is not null
    and u.deleted_at is null
    and (u.id = any(coalesce(p_user_ids, '{}'::uuid[]))
         or lower(u.email) in (select correo from pedidos))
$$;
revoke all on function public.correo_destinatarios_de_agencia(uuid, uuid[], text[]) from public, anon, authenticated;
grant execute on function public.correo_destinatarios_de_agencia(uuid, uuid[], text[]) to service_role;
comment on function public.correo_destinatarios_de_agencia(uuid, uuid[], text[]) is
  'De esos ids y esas direcciones, las cuentas de Maven de la misma agencia que p_quien (id y correo). Solo service_role: la usa send-notification-email para no mandar nunca a una dirección suelta.';
