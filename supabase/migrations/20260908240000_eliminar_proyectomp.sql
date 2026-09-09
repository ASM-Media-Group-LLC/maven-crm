-- ProyectoMP ya estaba eliminado del producto: no queda página, ruta, entrada de
-- menú ni catálogo de permisos en el front. Sobrevivían las 14 tablas mp_*, 12 de
-- ellas vacías (solo 3 fases y 7 hitos del esqueleto), y el módulo seguía saliendo
-- en Administración → Roles, confundiendo a quien configura — el mismo problema
-- que tuvo "Ventas". Jhon confirmó el borrado el 08/09.
--
-- Verificado antes de borrar: ninguna función, vista, FK externa ni edge function
-- las referencia.

-- Respaldo de lo poco que había, CON RLS desde el arranque (create table as select
-- NO la hereda; así quedaron abiertos a anon los respaldos de BLU del 06/09).
create table if not exists public.mp_respaldo_20260908 as
  select 'mp_phases' as tabla, to_jsonb(t) as fila from public.mp_phases t
  union all
  select 'mp_milestones', to_jsonb(t) from public.mp_milestones t;

alter table public.mp_respaldo_20260908 enable row level security;

drop table if exists
  public.mp_candidate_checklist,
  public.mp_candidates,
  public.mp_content_entries,
  public.mp_content_sessions,
  public.mp_financials,
  public.mp_milestones,
  public.mp_models,
  public.mp_phases,
  public.mp_tasks,
  public.mp_team_members,
  public.mp_team_plan,
  public.mp_traffic_organic,
  public.mp_traffic_paid,
  public.mp_traffic_sfs
  cascade;

-- El permiso huérfano sale de la pantalla de Roles.
delete from public.role_permissions where module = 'ProyectoMP';
