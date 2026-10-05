-- PERSONAS POR AGENCIA (fase 0, entrega 3a del plan «Maven Basic»).
-- Banco: supabase/tests/personas_por_agencia.ts.
--
-- Hasta hoy cualquier cuenta con sesión veía el perfil de TODA la gente de Maven:
-- la política de SELECT de profiles era «Authenticated users can view all
-- profiles», USING (true). Cada pantalla que lista personas lee de ahí: con una
-- segunda agencia, su gente vería el nombre y la foto de la gente de KASH, y al
-- revés.
--
-- Qué cambia:
--   1. gente_de_mi_agencia(): los user_id de la agencia de quien llama
--      (current_tenant_id). Es SECURITY DEFINER porque, dentro de una política,
--      tenant_members solo deja ver la fila propia. Devuelve un conjunto: la
--      política lo calcula una vez por consulta, no una vez por fila.
--   2. La política de SELECT de profiles: uno mismo, o alguien de su agencia.
--      Una cuenta sin agencia ve solo su propio perfil. service_role (las edge
--      functions) sigue viendo todo, como siempre.
-- Con una sola agencia nadie deja de ver a nadie: el banco lo compara persona
-- por persona contra prod.
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| alter policy "Profiles de la propia agencia" on public.profiles rename to "Authenticated users can view all profiles";
--| alter policy "Authenticated users can view all profiles" on public.profiles using (true);
--| drop function if exists public.gente_de_mi_agencia();

create function public.gente_de_mi_agencia()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select tm.user_id from public.tenant_members tm where tm.tenant_id = public.current_tenant_id()
$$;

comment on function public.gente_de_mi_agencia() is
  'Los user_id de la agencia de quien llama. Para políticas y funciones: tenant_members solo le deja ver a cada uno su propia fila.';

revoke all on function public.gente_de_mi_agencia() from public, anon;
grant execute on function public.gente_de_mi_agencia() to authenticated, service_role;

alter policy "Authenticated users can view all profiles" on public.profiles
  using (id = (select auth.uid()) or id in (select public.gente_de_mi_agencia()));
alter policy "Authenticated users can view all profiles" on public.profiles
  rename to "Profiles de la propia agencia";
