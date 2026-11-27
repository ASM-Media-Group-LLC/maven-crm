-- PENDIENTES Y SUGERENCIAS PARA QUIEN CUADRA A LOS EMPLEADOS (Alvaro, 27/11/2026).
-- Un cuadrito abajo a la derecha que recuerda lo que falta («tienes personas sin
-- horario confirmado») y sugiere funciones que la empresa no está usando
-- («puedes ponerle hora a la comida»). No bloquea: se cierra y sigue.
--
-- Cada cosa la ve solo quien la puede arreglar, y eso sale de su Posición:
--   · horarios sin confirmar → quien puede editar el horario de esa persona
--     (puede_editar_horario: dueño o N:horarios.gestionar en su alcance);
--   · personas sin Posición, hora de comida de los planes y turnos de la
--     empresa → quien configura la empresa (puedo_configurar_empresa).
--
-- Vuelta atrás: drop function if exists public.pendientes_de_gestion();

create or replace function public.pendientes_de_gestion()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  yo uuid := (select auth.uid());
  emp uuid := public.empresa_de((select auth.uid()));
  configura boolean := public.puedo_configurar_empresa();
  items jsonb := '[]'::jsonb;
  n integer;
begin
  if yo is null or emp is null then return items; end if;

  -- 1) Horarios sin confirmar (solo los que yo puedo arreglar).
  select count(*) into n
    from public.profiles p
    join public.tenant_members m on m.user_id = p.id and m.tenant_id = emp
   where p.deleted_at is null
     and public.puede_editar_horario(p.id)
     and not exists (select 1 from public.horario_confirmado h where h.user_id = p.id);
  if n > 0 then
    items := items || jsonb_build_array(jsonb_build_object('clave', 'horarios', 'tipo', 'pendiente', 'n', n, 'ruta', '/hr/horarios-equipo'));
  end if;

  if configura then
    -- 2) Personas sin Posición: sin posición no tienen permisos, pausa ni reglas.
    select count(*) into n
      from public.profiles p
      join public.tenant_members m on m.user_id = p.id and m.tenant_id = emp
     where p.deleted_at is null
       and not exists (select 1 from public.posiciones_borrador_personas a where a.user_id = p.id);
    if n > 0 then
      items := items || jsonb_build_array(jsonb_build_object('clave', 'sin_posicion', 'tipo', 'pendiente', 'n', n, 'ruta', '/ajustes/posiciones'));
    end if;

    -- 3) Sugerencia: planes con comida pero sin hora de comida.
    select count(*) into n
      from public.pausas_modalidades
     where tenant_id = emp and activa and comida_min > 0 and comida_hora is null;
    if n > 0 then
      items := items || jsonb_build_array(jsonb_build_object('clave', 'comida_sin_hora', 'tipo', 'sugerencia', 'n', n, 'ruta', '/ajustes/empresa'));
    end if;

    -- 4) Sugerencia: turnos de la empresa (si la tabla existe en esta base).
    if to_regclass('public.turnos_empresa') is not null then
      execute 'select count(*) from public.turnos_empresa where tenant_id = $1 and activa' into n using emp;
      if n = 0 then
        items := items || jsonb_build_array(jsonb_build_object('clave', 'turnos_sin_crear', 'tipo', 'sugerencia', 'n', 0, 'ruta', '/ajustes/empresa'));
      elsif not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'posiciones_borrador' and column_name = 'turno_id') then
        null;
      else
        execute 'select count(*) from public.posiciones_borrador where tenant_id = $1 and activa and turno_id is not null' into n using emp;
        if n = 0 then
          items := items || jsonb_build_array(jsonb_build_object('clave', 'turnos_sin_usar', 'tipo', 'sugerencia', 'n', 0, 'ruta', '/ajustes/posiciones'));
        end if;
      end if;
    end if;
  end if;

  return items;
end $$;
revoke all on function public.pendientes_de_gestion() from public, anon;
grant execute on function public.pendientes_de_gestion() to authenticated;
