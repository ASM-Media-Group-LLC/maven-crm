-- MAVEN ABRE LIVIANA (simulacro v2, 19/11/2026).
--
-- Con 1000 personas abriendo a la vez, «cargar la app» salió bien solo entre el
-- 37 y el 77 % (30 s de espera) mientras Postgres estaba ocioso: el cuello no
-- era el costo de las consultas sino CUÁNTAS peticiones pasan por PostgREST y
-- el pool de conexiones. Al abrir, cada navegador pedía por separado:
--   user_roles, role_groups (dos veces: useUserRole y useRoleTier),
--   roles_config, role_permissions, chatter_examinadores,
--   profiles tres veces (skin, presencia, menú) y app_flags 'reloj_24h'.
-- Esta función devuelve todo eso en UNA ida y vuelta.
--
-- ⚠️ SECURITY INVOKER a propósito: corre con la RLS de quien llama, así que ve
-- exactamente lo mismo que veían las consultas sueltas (agencia, papelera,
-- etc.) sin copiar a mano la lógica de cada política. No da ni un dato más.
--
-- Contrato con el frontend (frontend/src/lib/arranque.ts):
--   - Si esta función falla, el frontend vuelve al camino viejo (consultas
--     sueltas). Un fallo NUNCA se toma como «sin rol» ni «sin permisos».
--   - permisos = null  → el frontend no la usa y pregunta como antes (sin rol,
--     o más de una fila de roles_config visible: el camino viejo da el error).
--   - permisos = []    → el rol no tiene configuración (igual que antes: []).
create or replace function public.mi_arranque()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  _uid uuid := (select auth.uid());
  _rol text;
  _grupo jsonb;
  _rc_ids uuid[];
  _permisos jsonb;
  _examinador boolean;
  _perfil jsonb;
  _reloj boolean;
begin
  if _uid is null then
    return null;
  end if;

  select ur.role::text into _rol
  from public.user_roles ur
  where ur.user_id = _uid
  limit 1;

  if _rol is not null then
    select jsonb_build_object(
             'is_admin', rg.is_admin,
             'is_manager_or_above', rg.is_manager_or_above,
             'is_supervisor_or_above', rg.is_supervisor_or_above
           ) into _grupo
    from public.role_groups rg
    where rg.role_name::text = _rol
    limit 1;

    select array_agg(rc.id) into _rc_ids
    from public.roles_config rc
    where rc.name::text = _rol and rc.is_active = true;

    if coalesce(array_length(_rc_ids, 1), 0) = 0 then
      _permisos := '[]'::jsonb;
    elsif array_length(_rc_ids, 1) = 1 then
      select coalesce(jsonb_agg(jsonb_build_object(
               'module', rp.module,
               'submodule', rp.submodule,
               'can_access', rp.can_access,
               'data_scope', rp.data_scope
             )), '[]'::jsonb) into _permisos
      from public.role_permissions rp
      where rp.role_id = _rc_ids[1];
    end if;
  end if;

  select ce.permitido into _examinador
  from public.chatter_examinadores ce
  where ce.user_id = _uid
  limit 1;

  select jsonb_build_object(
           'id', p.id,
           'full_name', p.full_name,
           'avatar_url', p.avatar_url,
           'avatar_seed', p.avatar_seed,
           'phone_e164', p.phone_e164,
           'ui_skin', p.ui_skin,
           'ui_prefs', p.ui_prefs,
           'whatsapp_push_name', p.whatsapp_push_name,
           'whatsapp_verified_at', p.whatsapp_verified_at,
           'status', p.status,
           'status_color', p.status_color,
           'status_text', p.status_text,
           'status_expires_at', p.status_expires_at
         ) into _perfil
  from public.profiles p
  where p.id = _uid;

  select f.enabled into _reloj
  from public.app_flags f
  where f.key = 'reloj_24h';

  return jsonb_build_object(
    'uid', _uid,
    'rol', _rol,
    'grupo', _grupo,
    'permisos', _permisos,
    'examinador', _examinador,
    'perfil', _perfil,
    'reloj_24h', _reloj
  );
end;
$$;

revoke all on function public.mi_arranque() from public, anon;
grant execute on function public.mi_arranque() to authenticated;

comment on function public.mi_arranque() is
  'Todo lo que el navegador necesita al abrir Maven (rol, grupo, permisos, examinador, perfil propio, reloj_24h) en una sola petición. SECURITY INVOKER: misma RLS que las consultas sueltas.';
