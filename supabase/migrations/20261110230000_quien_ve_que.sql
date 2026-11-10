-- QUIÉN VE QUÉ (Alvaro, 10/11/2026: «no quiero que todo el mundo vaya a ver
-- esta mierda»). Dos reglas nuevas en la base:
--
-- 1) La SALUD DE LA PLATAFORMA y el NAS son solo del DUEÑO. Los admins
--    conservan el Centro de operaciones (Pulso, horas, mensajería), pero ya no
--    ven el estado técnico ni el espacio del NAS. Antes estas funciones dejaban
--    pasar a dueño o admin (es_admin_o_dueno); ahora solo al dueño (es_dueno).
--
-- 2) CADA SUPERVISOR VE A SU EQUIPO en el Pulso. Un supervisor (profiles.nivel =
--    'supervisor') ve el estado en vivo de Argos (ronda, pausas, faltas) de los
--    agentes de SU equipo, y de nadie más. El equipo sale del rol, con el mismo
--    mapa que usa la pantalla (useTurnoPersonas.EQUIPO_POR_ROL). Hasta hoy esa
--    data solo la veían el dueño y RR. HH.

-- ── 1) Salud y NAS: solo el dueño ─────────────────────────────────────────
-- Las 11 funciones tienen UNA sola llamada a es_admin_o_dueno y es su puerta
-- de entrada («if not … then raise»). Se cambia esa puerta y nada más.
do $$
declare
  f record;
  quedan int;
begin
  for f in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('salud_sistema', 'nas_espacio_resumen', 'nas_entro_semana', 'nas_por_modelo',
                        'nas_historia', 'nas_explorar', 'nas_mas_pesados', 'nas_ficha',
                        'nas_que_liberar', 'nas_por_tipo', 'nas_buscar')
  loop
    execute replace(pg_get_functiondef(f.oid), 'public.es_admin_o_dueno(', 'public.es_dueno(');
  end loop;

  select count(*) into quedan
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('salud_sistema', 'nas_espacio_resumen', 'nas_entro_semana', 'nas_por_modelo',
                      'nas_historia', 'nas_explorar', 'nas_mas_pesados', 'nas_ficha',
                      'nas_que_liberar', 'nas_por_tipo', 'nas_buscar')
    and pg_get_functiondef(p.oid) like '%es_admin_o_dueno%';
  if quedan > 0 then
    raise exception 'quedaron % funciones de Salud/NAS abiertas a admin', quedan;
  end if;
end $$;

alter policy nas_espacio_admin_lee on public.nas_espacio
  using (public.es_dueno((select auth.uid())));
alter policy nas_espacio_alertas_admin_lee on public.nas_espacio_alertas
  using (public.es_dueno((select auth.uid())));

-- ── 2) Cada supervisor ve a su equipo ─────────────────────────────────────
-- El equipo de una persona, por su rol. Igual que EQUIPO_POR_ROL en la
-- pantalla; sin rol conocido = 'Otros' (y 'Otros' no forma equipo).
create or replace function public.equipo_de(_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select m.equipo
    from public.user_roles ur
    join (values
      ('chatter', 'Chatters'), ('chatter supervisor', 'Chatters'),
      ('pr', 'PR'), ('warming', 'Warming'),
      ('coordinador', 'Editores'), ('coordinador supervisor', 'Editores'),
      ('finanzas', 'Finanzas'), ('closer', 'Closers'),
      ('operations sales', 'Operaciones'), ('admin', 'Admin'),
      ('hhrr', 'RRHH'), ('rrhh', 'RRHH')
    ) as m(rol, equipo) on m.rol = lower(ur.role)
    where ur.user_id = _uid
    order by m.equipo
    limit 1
  ), 'Otros');
$$;

-- A quién supervisa quien pregunta: si es supervisor, los AGENTES activos de su
-- mismo equipo y de su misma agencia. Para cualquier otro, nadie.
create or replace function public.mi_equipo_supervisado()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (
    select p.id, public.equipo_de(p.id) as equipo
    from public.profiles p
    where p.id = (select auth.uid())
      and p.nivel = 'supervisor'
      and p.deleted_at is null
  )
  select t.id
  from public.profiles t, yo
  where yo.equipo <> 'Otros'
    and t.id <> yo.id
    and t.deleted_at is null
    and t.nivel = 'agente'
    and public.equipo_de(t.id) = yo.equipo
    and exists (
      select 1
      from public.user_roles a
      join public.user_roles b on b.tenant_id = a.tenant_id
      where a.user_id = yo.id and b.user_id = t.id
    );
$$;

revoke all on function public.equipo_de(uuid) from public, anon;
revoke all on function public.mi_equipo_supervisado() from public, anon;
grant execute on function public.equipo_de(uuid) to authenticated;
grant execute on function public.mi_equipo_supervisado() to authenticated;

-- Lo que el Pulso lee para pintar el estado en vivo: la última ronda de Argos,
-- las pausas abiertas y las faltas recientes. Políticas NUEVAS (permisivas, se
-- suman a las que ya había): el supervisor ve las de su equipo.
create policy monitor_rondas_sel_su_equipo on public.monitor_rondas
  for select to authenticated
  using (user_id in (select s.user_id from public.mi_equipo_supervisado() s));

create policy cowork_breaks_sel_su_equipo on public.cowork_breaks
  for select to authenticated
  using (user_id in (select s.user_id from public.mi_equipo_supervisado() s));

create policy monitor_eventos_sel_su_equipo on public.monitor_eventos
  for select to authenticated
  using (user_id in (select s.user_id from public.mi_equipo_supervisado() s));
