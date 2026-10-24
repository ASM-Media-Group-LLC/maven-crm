-- centro_ahora(): la base de la sección "Ahora mismo" del Centro de
-- operaciones del dueño. UNA llamada devuelve, por persona:
--   · si está PROGRAMADA en el turno actual (horarios de chatters: grupo vigente
--     + turno am/pm/mad con las mismas horas que el front —08-16 / 16-24 / 00-08
--     Bogotá—, descontando sus descansos de la semana),
--   · si está CONECTADA al reloj de Cowork (segmento abierto con latido < 2 min,
--     la misma regla del centro-operaciones admin) y su estado,
--   · su pausa abierta y si pasó el límite de la tabla cowork_break_limits.
-- Con eso el tablero saca "debería estar y no está", "pausa pasada" y
-- "conectado con problema" sin N consultas por persona (lección del 23/10:
-- una llamada agregada, se sondea cada 45 s, react-query no sondea pestañas
-- ocultas).
--
-- Alcance (decidido ADENTRO, security definer): supervisor o superior y admin
-- ven a todos; cualquier otro, solo su propia fila.
create or replace function public.centro_ahora()
returns table (
  user_id uuid,
  nombre text,
  grupo text,
  agencia text,
  turno text,
  programado boolean,
  conectado boolean,
  estado text,
  pausa_kind text,
  pausa_seg integer,
  pausa_limite_min integer,
  pausa_excedida boolean
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with t as (
    select (now() at time zone 'America/Bogota') as ts
  ), marco as (
    select
      case
        when extract(hour from t.ts) between 8 and 15 then 'am'
        when extract(hour from t.ts) >= 16 then 'pm'
        else 'mad'
      end as turno,
      t.ts::date as hoy,
      (date_trunc('week', t.ts))::date as semana,
      (extract(isodow from t.ts)::int - 1)::smallint as dia
    from t
  ), programados as (
    select ci.maven_user_id as p_user_id,
           ci.display_name as p_nombre,
           g.name as p_grupo,
           g.agency as p_agencia,
           m.shift as p_turno
    from chatter_group_members m
    join chatter_groups g on g.id = m.group_id and g.active
    join chatter_identity ci on ci.id = m.identity_id and ci.active
    cross join marco
    where ci.maven_user_id is not null
      and m.valid_from <= marco.hoy
      and (m.valid_to is null or m.valid_to >= marco.hoy)
      and m.shift = marco.turno
      and not exists (
        select 1 from chatter_rest_days r
        where r.week_start = marco.semana
          and r.weekday = marco.dia
          and r.identity_id = m.identity_id
      )
  ), conectados as (
    select distinct on (s.user_id) s.user_id as c_user_id, s.estado as c_estado
    from cowork_tiempo_segmentos s
    where s.ended_at is null
      and s.last_seen_at > now() - interval '2 minutes'
    order by s.user_id, s.last_seen_at desc
  ), pausas as (
    select distinct on (b.user_id)
      b.user_id as b_user_id,
      b.kind as b_kind,
      extract(epoch from (now() - b.started_at))::int as b_seg,
      (select min(l.minutos) from cowork_break_limits l where l.kind = b.kind) as b_limite_min
    from cowork_breaks b
    where b.ended_at is null
    order by b.user_id, b.started_at desc
  ), gente as (
    select coalesce(p.p_user_id, c.c_user_id) as g_user_id,
           p.p_nombre, p.p_grupo, p.p_agencia, p.p_turno,
           (p.p_user_id is not null) as g_programado,
           (c.c_user_id is not null) as g_conectado,
           c.c_estado
    from programados p
    full outer join conectados c on c.c_user_id = p.p_user_id
  )
  select g.g_user_id,
         coalesce(g.p_nombre, pr.full_name),
         g.p_grupo, g.p_agencia, g.p_turno,
         g.g_programado, g.g_conectado, g.c_estado,
         pa.b_kind, pa.b_seg, pa.b_limite_min,
         (pa.b_kind is not null and pa.b_limite_min is not null and pa.b_seg > pa.b_limite_min * 60)
  from gente g
  left join pausas pa on pa.b_user_id = g.g_user_id
  left join profiles pr on pr.id = g.g_user_id
  where public.is_in_role_group((select auth.uid()), 'supervisor_or_above')
     or public.is_in_role_group((select auth.uid()), 'admin')
     or g.g_user_id = (select auth.uid());
$$;

grant execute on function public.centro_ahora() to authenticated;
