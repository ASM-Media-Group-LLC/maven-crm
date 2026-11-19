-- CÁMARA Y PANTALLA POR PUESTO (Alvaro, 19/11/2026).
--
-- «Quién está obligado a compartir cámara y pantalla lo deciden el dueño y el
-- admin, en los roles.» Decisiones (preguntas y respuestas del 19/11):
--   · Va POR PUESTO, nunca por persona: cada puesto marca «pide cámara» y «pide
--     pantalla» por separado. Para exceptuar a alguien se le cambia el puesto.
--   · Argos va con la pantalla: si el puesto pide pantalla, Argos lo vigila; si
--     no la pide, no hay Argos (aunque la persona comparta por su cuenta).
--   · Solo manda el puesto: las salas de Cowork ya no apagan cámara ni pantalla.
--   · El dueño cambia todos los puestos; un admin (función del puesto
--     N:camara_pantalla.decidir) todos menos el puesto Admin, el Dueño y el suyo.
--   · Cada cambio (de un puesto, o de una persona que pasa a otro puesto que
--     pide distinto) avisa por campana + celular a la gente afectada, a sus
--     jefes directos y a RR. HH., y manda un correo al dueño, a los admins y a
--     RR. HH. (menos a quien lo hizo), con la marca de la empresa.
--   · Persona con dos puestos (solo los admins pueden): con que uno no lo pida,
--     no se le pide.
--   · Juan Pachas pasa a un puesto aparte, «Closer externo», sin cámara ni
--     pantalla (ni Argos); Closer sigue pidiendo.
-- Reemplaza las excepciones a mano: argos_reglas_persona (pantalla, cámara,
-- vigilar_aunque_admin), personas_borrador_marcas.sin_camara y los
-- interruptores de exoneración por persona o rol.

-- 1) Lo que pide cada puesto, y la marca de cada empresa (para el correo).
alter table public.posiciones_borrador
  add column if not exists pide_camara boolean not null default true,
  add column if not exists pide_pantalla boolean not null default true;

alter table public.tenants
  add column if not exists marca_nombre text,
  add column if not exists marca_logo_url text;

comment on column public.posiciones_borrador.pide_camara is
  'El puesto pide cámara encendida (Alvaro, 19/11/2026). Persona con dos puestos: con que uno no la pida, no se le pide.';
comment on column public.posiciones_borrador.pide_pantalla is
  'El puesto pide compartir pantalla; Argos vigila solo a quien su puesto le pide pantalla (Alvaro, 19/11/2026).';

-- 2) Lo que se le pide a una persona: sale de sus puestos activos.
--    Sin puesto: se le pide (como antes), salvo admins; el dueño nunca.
create or replace function public.exige_camara(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _uid is not null and not public.es_dueno(_uid) and coalesce((
    select bool_and(pb.pide_camara)
      from public.posiciones_borrador_personas pp
      join public.posiciones_borrador pb on pb.id = pp.posicion_id and pb.activa
     where pp.user_id = _uid
  ), not coalesce(public.is_in_role_group(_uid, 'admin'), false));
$$;

create or replace function public.exige_pantalla(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _uid is not null and not public.es_dueno(_uid) and coalesce((
    select bool_and(pb.pide_pantalla)
      from public.posiciones_borrador_personas pp
      join public.posiciones_borrador pb on pb.id = pp.posicion_id and pb.activa
     where pp.user_id = _uid
  ), not coalesce(public.is_in_role_group(_uid, 'admin'), false));
$$;

grant execute on function public.exige_camara(uuid), public.exige_pantalla(uuid) to authenticated, service_role;

-- Lo mío (Cowork lo usa para no pedir lo que el puesto no pide).
create or replace function public.mis_exigencias()
returns table (camara boolean, pantalla boolean)
language sql
stable
security definer
set search_path = public
as $$
  select public.exige_camara((select auth.uid())), public.exige_pantalla((select auth.uid()));
$$;
grant execute on function public.mis_exigencias() to authenticated;

-- Para cowork-session (servidor): qué se le exige a quien late.
create or replace function public.exigencias_de(_uid uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('camara', public.exige_camara(_uid), 'pantalla', public.exige_pantalla(_uid));
$$;
revoke all on function public.exigencias_de(uuid) from public, anon, authenticated;
grant execute on function public.exigencias_de(uuid) to service_role;

-- 3) Argos va con la pantalla. Se acaba «vigilar aunque sea admin» por persona.
create or replace function public.argos_vigila_a(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.exige_pantalla(_uid);
$$;

create or replace function public.mi_regla_de_anfitrion()
returns table (vigilado boolean, pantalla_obligatoria boolean, camara_obligatoria boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.argos_vigila_a((select auth.uid())),
         public.exige_pantalla((select auth.uid())),
         public.exige_camara((select auth.uid()));
$$;

-- El Hub de supervisores mira lo que pide el puesto, no la regla por persona.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.hub_problemas_ahora(timestamp with time zone)'::regprocedure);
  n := replace(d, 'coalesce(r.pantalla_obligatoria, true) as exige_pantalla', 'public.exige_pantalla(p.id) as exige_pantalla');
  n := replace(n, 'coalesce(r.camara_obligatoria, true) as exige_camara', 'public.exige_camara(p.id) as exige_camara');
  if n = d or position('r.pantalla_obligatoria' in n) > 0 or position('r.camara_obligatoria' in n) > 0 then
    raise exception 'hub_problemas_ahora: no se encontró la regla por persona para cambiarla';
  end if;
  execute n;
end $$;

-- 4) La nota y la gracia (profiles/roles_config.exonera_camara_pantalla) se
--    sincronizan con el puesto: exento = el puesto no pide ni cámara ni pantalla.
create or replace function public.exigencias_sincronizar()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles pr
     set exonera_camara_pantalla = not (public.exige_camara(pr.id) or public.exige_pantalla(pr.id))
   where pr.deleted_at is null
     and exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id)
     and coalesce(pr.exonera_camara_pantalla, false) is distinct from not (public.exige_camara(pr.id) or public.exige_pantalla(pr.id));
  update public.roles_config rc
     set exonera_camara_pantalla = not (pb.pide_camara or pb.pide_pantalla)
    from public.posiciones_borrador pb
   where pb.rol is not null and pb.rol <> 'admin' and rc.name = pb.rol
     and coalesce(rc.exonera_camara_pantalla, false) is distinct from not (pb.pide_camara or pb.pide_pantalla);
$$;
revoke all on function public.exigencias_sincronizar() from public, anon, authenticated;

do $$
declare d text; n text;
begin
  d := pg_get_functiondef('public.posiciones_aplicar(boolean, boolean)'::regprocedure);
  n := replace(d, 'coalesce(m.sin_camara, false) as quiere',
                  'not (public.exige_camara(pr.id) or public.exige_pantalla(pr.id)) as quiere');
  n := replace(n, 'is distinct from coalesce(m.sin_camara, false)',
                  'is distinct from not (public.exige_camara(pr.id) or public.exige_pantalla(pr.id))');
  n := replace(n, $a$  if exists (select 1 from public.posiciones_borrador where rol = 'Marketing')$a$,
$b$  for _c in select pb.rol, not (pb.pide_camara or pb.pide_pantalla) as quiere
             from public.posiciones_borrador pb where pb.rol is not null and pb.rol <> 'admin' loop
    if exists (select 1 from public.roles_config rc where rc.name = _c.rol
                and coalesce(rc.exonera_camara_pantalla, false) is distinct from _c.quiere) then
      insert into _pos_dif values ('camara', _c.rol, case when _c.quiere then 'el puesto ya no pide cámara ni pantalla' else 'el puesto pide cámara o pantalla' end);
      if not _simular then update public.roles_config set exonera_camara_pantalla = _c.quiere where name = _c.rol; end if;
    end if;
  end loop;

  if exists (select 1 from public.posiciones_borrador where rol = 'Marketing')$b$);
  if n = d or position('m.sin_camara' in n) > 0 or position('el puesto ya no pide' in n) = 0 then
    raise exception 'posiciones_aplicar: no se encontró el bloque de cámara para cambiarlo';
  end if;
  execute n;
end $$;

-- Los interruptores viejos (por persona y por rol) ya no mandan.
create or replace function public.argos_exonerar_persona(_user uuid, _on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'La cámara y la pantalla ahora van por puesto (Ajustes → Empresa)' using errcode = '42501';
end $$;

create or replace function public.argos_exonerar_rol(_role text, _on boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'La cámara y la pantalla ahora van por puesto (Ajustes → Empresa)' using errcode = '42501';
end $$;

-- 5) Quién puede cambiarlo.
create or replace function public.puede_cambiar_exigencias(_actor uuid, _posicion uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _actor is not null and (
    public.es_dueno(_actor)
    or (
      public.tiene_funcion(_actor, 'N:camara_pantalla.decidir')
      and exists (select 1 from public.posiciones_borrador pb
                   where pb.id = _posicion and not pb.acceso_total
                     and coalesce(pb.rol, '') <> 'admin' and pb.nombre <> 'Dueño')
      and not exists (select 1 from public.posiciones_borrador_personas pp
                       where pp.posicion_id = _posicion and pp.user_id = _actor)
    )
  );
$$;
grant execute on function public.puede_cambiar_exigencias(uuid, uuid) to authenticated;

-- 6) La foto de lo que se le pide a cada quien (para ver qué cambió) y el
--    registro de cambios, que también es la cola del correo.
create table if not exists public.exigencias_estado (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  camara boolean not null,
  pantalla boolean not null,
  puestos text,
  actualizado timestamptz not null default now()
);
alter table public.exigencias_estado enable row level security;

create table if not exists public.exigencias_cambios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  created_at timestamptz not null default now(),
  actor_id uuid,
  tipo text not null check (tipo in ('puesto', 'persona')),
  posicion_id uuid,
  posicion_nombre text,
  user_id uuid,
  puesto_antes text,
  puesto_despues text,
  camara_antes boolean not null,
  camara_despues boolean not null,
  pantalla_antes boolean not null,
  pantalla_despues boolean not null,
  afectados jsonb not null default '[]'::jsonb,
  destinatarios uuid[] not null default '{}',
  correo_a text[],
  correo_enviado_at timestamptz,
  correo_intentos integer not null default 0
);
create index if not exists exigencias_cambios_pendientes on public.exigencias_cambios (created_at) where correo_enviado_at is null;
alter table public.exigencias_cambios enable row level security;
drop policy if exists exigencias_cambios_ver on public.exigencias_cambios;
create policy exigencias_cambios_ver on public.exigencias_cambios for select to authenticated
  using ((select public.es_dueno((select auth.uid())))
         or (select public.tiene_funcion((select auth.uid()), 'N:camara_pantalla.decidir'))
         or (select public.tiene_funcion((select auth.uid()), 'N:horarios.gestionar')));

-- Textos.
create or replace function public.exigencias_linea(_antes boolean, _despues boolean)
returns text
language sql
immutable
as $$
  select case when _antes and not _despues then 'ya no se pide'
              when not _antes and _despues then 'ahora se pide'
              when _despues then 'se sigue pidiendo'
              else 'sigue sin pedirse' end;
$$;

create or replace function public.exigencias_resumen(_ca boolean, _cd boolean, _pa boolean, _pd boolean)
returns text
language sql
immutable
as $$
  select 'Cámara: ' || public.exigencias_linea(_ca, _cd) || ' · Pantalla: ' || public.exigencias_linea(_pa, _pd) || '.'
      || case when _pa and not _pd then ' Argos deja de vigilar.'
              when not _pa and _pd then ' Argos empieza a vigilar en el turno.'
              else '' end;
$$;

-- Quién recibe el correo: dueño, admins y RR. HH. de la empresa, menos quien lo hizo.
create or replace function public.exigencias_correo_para(_tenant uuid, _actor uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct x.uid), '{}')
    from (
      select o.user_id as uid from public.tenant_owners o where o.tenant_id = _tenant
      union
      select pp.user_id from public.posiciones_borrador_personas pp
        join public.posiciones_borrador pb on pb.id = pp.posicion_id and pb.activa and pb.rol = 'admin'
      union
      select f.user_id from public.con_funcion('N:horarios.gestionar') f
      union
      select f.user_id from public.con_funcion('N:argos.casos.juzgar') f
      union
      select f.user_id from public.con_funcion('N:argos.casos.jefe') f
    ) x
    join public.profiles p on p.id = x.uid and p.deleted_at is null
    join public.tenant_members tm on tm.user_id = x.uid and tm.tenant_id = _tenant
   where x.uid is distinct from _actor;
$$;
revoke all on function public.exigencias_correo_para(uuid, uuid) from public, anon, authenticated;

-- RR. HH. para la campana (por función del puesto).
create or replace function public.exigencias_rrhh()
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select f.user_id from public.con_funcion('N:argos.casos.juzgar') f
  union
  select f.user_id from public.con_funcion('N:argos.casos.jefe') f;
$$;
revoke all on function public.exigencias_rrhh() from public, anon, authenticated;

create or replace function public.exigencias_avisar(_uid uuid, _tipo text, _titulo text, _mensaje text, _link text, _ref uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, type, title, message, reference_id, reference_type,
                                    module_origin, priority, status, deep_link_url, visibility_scope, is_read)
  select _uid, _tipo, left(_titulo, 160), left(_mensaje, 400), _ref, 'exigencias_cambio',
         'argos', 'medium', 'new', _link, 'personal', false
   where _uid is not null;
$$;
revoke all on function public.exigencias_avisar(uuid, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.exigencias_silencio()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('maven.exigencias_silencio', true), '') = 'on';
$$;

-- 7) Cambió lo que pide un puesto.
create or replace function public.exigencias_al_cambiar_puesto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_nombre text;
  v_tenant uuid;
  v_afectados jsonb;
  v_id uuid;
  v_resumen text;
  v_jefe record;
  v_rh record;
  v_p record;
begin
  if v_actor is not null and not public.puede_cambiar_exigencias(v_actor, new.id) then
    raise exception 'No puedes cambiar la cámara ni la pantalla del puesto %', new.nombre using errcode = '42501';
  end if;

  -- A quiénes les cambió de verdad (alguien con dos puestos puede no cambiar).
  select coalesce(jsonb_agg(jsonb_build_object('id', g.user_id, 'nombre', g.full_name) order by g.full_name)
                    filter (where g.c is distinct from coalesce(g.c0, old.pide_camara)
                               or g.s is distinct from coalesce(g.s0, old.pide_pantalla)), '[]'::jsonb)
    into v_afectados
    from (
      select pp.user_id, pr.full_name,
             public.exige_camara(pp.user_id) as c, public.exige_pantalla(pp.user_id) as s,
             es.camara as c0, es.pantalla as s0
        from public.posiciones_borrador_personas pp
        join public.profiles pr on pr.id = pp.user_id and pr.deleted_at is null
        left join public.exigencias_estado es on es.user_id = pp.user_id
       where pp.posicion_id = new.id
    ) g;

  insert into public.exigencias_estado (user_id, camara, pantalla, puestos, actualizado)
  select pp.user_id, public.exige_camara(pp.user_id), public.exige_pantalla(pp.user_id),
         (select string_agg(b.nombre, ' + ' order by b.orden) from public.posiciones_borrador_personas a
            join public.posiciones_borrador b on b.id = a.posicion_id where a.user_id = pp.user_id), now()
    from public.posiciones_borrador_personas pp
    join public.profiles pr on pr.id = pp.user_id and pr.deleted_at is null
   where pp.posicion_id = new.id
  on conflict (user_id) do update set camara = excluded.camara, pantalla = excluded.pantalla,
                                      puestos = excluded.puestos, actualizado = now();

  if public.exigencias_silencio() then return null; end if;

  v_tenant := coalesce(public.empresa_de(v_actor), (select tenant_id from public.roles_config where name = 'admin' limit 1));
  select full_name into v_actor_nombre from public.profiles where id = v_actor;
  v_actor_nombre := coalesce(v_actor_nombre, 'El sistema');
  v_resumen := public.exigencias_resumen(old.pide_camara, new.pide_camara, old.pide_pantalla, new.pide_pantalla);

  insert into public.exigencias_cambios (tenant_id, actor_id, tipo, posicion_id, posicion_nombre,
         camara_antes, camara_despues, pantalla_antes, pantalla_despues, afectados, destinatarios)
  values (v_tenant, v_actor, 'puesto', new.id, new.nombre,
          old.pide_camara, new.pide_camara, old.pide_pantalla, new.pide_pantalla, v_afectados,
          public.exigencias_correo_para(v_tenant, v_actor))
  returning id into v_id;

  -- La gente afectada.
  for v_p in select (a ->> 'id')::uuid as uid from jsonb_array_elements(v_afectados) a loop
    perform public.exigencias_avisar(v_p.uid, 'exigencias_tuyas', 'Cambió lo que te pide tu puesto',
      v_resumen || ' Lo cambió ' || v_actor_nombre || '.', '/cowork', v_id);
  end loop;

  -- Sus jefes directos (uno por jefe, con los suyos).
  for v_jefe in
    select j.user_id as jefe, string_agg(distinct a ->> 'nombre', ', ') as nombres, count(distinct a ->> 'id') as n
      from jsonb_array_elements(v_afectados) a
      cross join lateral public.jefes_directos((a ->> 'id')::uuid) j
     where j.user_id is distinct from v_actor
     group by j.user_id
  loop
    perform public.exigencias_avisar(v_jefe.jefe, 'exigencias_equipo', 'Cambió lo que se le pide a ' || new.nombre,
      v_resumen || ' De tu equipo: ' || v_jefe.nombres || '. Lo cambió ' || v_actor_nombre || '.', '/ajustes/empresa', v_id);
  end loop;

  -- RR. HH.
  for v_rh in select r.user_id from public.exigencias_rrhh() r where r.user_id is distinct from v_actor loop
    perform public.exigencias_avisar(v_rh.user_id, 'exigencias_rrhh', 'Cámara y pantalla: cambió el puesto ' || new.nombre,
      v_resumen || ' Afecta a ' || jsonb_array_length(v_afectados) || ' persona(s). Lo cambió ' || v_actor_nombre || '.',
      '/ajustes/empresa', v_id);
  end loop;
  return null;
end $$;

drop trigger if exists exigencias_puesto on public.posiciones_borrador;
create trigger exigencias_puesto
  after update of pide_camara, pide_pantalla on public.posiciones_borrador
  for each row
  when (old.pide_camara is distinct from new.pide_camara or old.pide_pantalla is distinct from new.pide_pantalla)
  execute function public.exigencias_al_cambiar_puesto();

-- 8) Cambió el puesto de alguien (o un puesto se apagó): se mira al cerrar la
--    transacción, con el estado final (un «mover» es borrar + insertar).
create or replace function public.exigencias_revisar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_nombre text;
  v_tenant uuid;
  v_id uuid;
  v_resumen text;
  v_r record;
  v_jefe record;
  v_rh record;
begin
  if coalesce(current_setting('maven.exigencias_revisadas', true), '') = 'on' then return null; end if;
  perform set_config('maven.exigencias_revisadas', 'on', true);

  v_tenant := coalesce(public.empresa_de(v_actor), (select tenant_id from public.roles_config where name = 'admin' limit 1));
  select full_name into v_actor_nombre from public.profiles where id = v_actor;
  v_actor_nombre := coalesce(v_actor_nombre, 'El sistema');

  for v_r in
    with gente as (
      select pr.id, pr.full_name,
             public.exige_camara(pr.id) as c, public.exige_pantalla(pr.id) as s,
             (select string_agg(b.nombre, ' + ' order by b.orden) from public.posiciones_borrador_personas a
                join public.posiciones_borrador b on b.id = a.posicion_id where a.user_id = pr.id) as puestos
        from public.profiles pr
       where pr.deleted_at is null
         and exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id)
    )
    select g.*, es.camara as c0, es.pantalla as s0, es.puestos as puestos0
      from gente g left join public.exigencias_estado es on es.user_id = g.id
     where es.user_id is null or es.camara is distinct from g.c or es.pantalla is distinct from g.s
        or es.puestos is distinct from g.puestos
  loop
    if v_r.c0 is not null and not public.exigencias_silencio()
       and (v_r.c0 is distinct from v_r.c or v_r.s0 is distinct from v_r.s) then
      v_resumen := public.exigencias_resumen(v_r.c0, v_r.c, v_r.s0, v_r.s);
      insert into public.exigencias_cambios (tenant_id, actor_id, tipo, user_id, puesto_antes, puesto_despues,
             camara_antes, camara_despues, pantalla_antes, pantalla_despues, afectados, destinatarios)
      values (v_tenant, v_actor, 'persona', v_r.id, v_r.puestos0, v_r.puestos,
              v_r.c0, v_r.c, v_r.s0, v_r.s, jsonb_build_array(jsonb_build_object('id', v_r.id, 'nombre', v_r.full_name)),
              public.exigencias_correo_para(v_tenant, v_actor))
      returning id into v_id;

      perform public.exigencias_avisar(v_r.id, 'exigencias_tuyas', 'Cambió lo que se te pide',
        'Ahora estás en ' || coalesce(v_r.puestos, 'otro puesto') || '. ' || v_resumen, '/cowork', v_id);
      for v_jefe in select j.user_id from public.jefes_directos(v_r.id) j where j.user_id is distinct from v_actor loop
        perform public.exigencias_avisar(v_jefe.user_id, 'exigencias_equipo', v_r.full_name || ': cambió lo que se le pide',
          'Pasó de ' || coalesce(v_r.puestos0, 'sin puesto') || ' a ' || coalesce(v_r.puestos, 'sin puesto') || '. '
          || v_resumen || ' Lo cambió ' || v_actor_nombre || '.', '/ajustes/empresa', v_id);
      end loop;
      for v_rh in select r.user_id from public.exigencias_rrhh() r where r.user_id is distinct from v_actor and r.user_id <> v_r.id loop
        perform public.exigencias_avisar(v_rh.user_id, 'exigencias_rrhh', v_r.full_name || ': cambió lo que se le pide',
          'Pasó de ' || coalesce(v_r.puestos0, 'sin puesto') || ' a ' || coalesce(v_r.puestos, 'sin puesto') || '. '
          || v_resumen || ' Lo cambió ' || v_actor_nombre || '.', '/ajustes/empresa', v_id);
      end loop;
    end if;

    insert into public.exigencias_estado (user_id, camara, pantalla, puestos, actualizado)
    values (v_r.id, v_r.c, v_r.s, v_r.puestos, now())
    on conflict (user_id) do update set camara = excluded.camara, pantalla = excluded.pantalla,
                                        puestos = excluded.puestos, actualizado = now();
  end loop;
  return null;
end $$;

drop trigger if exists exigencias_revisar_personas on public.posiciones_borrador_personas;
create constraint trigger exigencias_revisar_personas
  after insert or update or delete on public.posiciones_borrador_personas
  deferrable initially deferred
  for each row execute function public.exigencias_revisar();

drop trigger if exists exigencias_revisar_puestos on public.posiciones_borrador;
create constraint trigger exigencias_revisar_puestos
  after insert or update or delete on public.posiciones_borrador
  deferrable initially deferred
  for each row execute function public.exigencias_revisar();

-- 9) Para la pantalla de Ajustes → Empresa: los puestos con lo que piden,
--    quién puede cambiar qué, y los últimos cambios.
create or replace function public.exigencias_por_puesto()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select (select auth.uid()) as uid)
  select jsonb_build_object(
    'puestos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pb.id, 'nombre', pb.nombre, 'pide_camara', pb.pide_camara, 'pide_pantalla', pb.pide_pantalla,
               'personas', (select count(*) from public.posiciones_borrador_personas pp
                              join public.profiles pr on pr.id = pp.user_id and pr.deleted_at is null
                             where pp.posicion_id = pb.id),
               'puede_cambiar', public.puede_cambiar_exigencias(yo.uid, pb.id),
               'motivo', case
                 when public.puede_cambiar_exigencias(yo.uid, pb.id) then null
                 when not (public.es_dueno(yo.uid) or public.tiene_funcion(yo.uid, 'N:camara_pantalla.decidir')) then 'sin_funcion'
                 when pb.acceso_total or pb.nombre = 'Dueño' then 'dueno'
                 when coalesce(pb.rol, '') = 'admin' then 'admin'
                 else 'propio' end
             ) order by pb.orden, pb.nombre)
        from public.posiciones_borrador pb where pb.activa), '[]'::jsonb),
    'cambios', coalesce((
      select jsonb_agg(c.j order by c.created_at desc) from (
        select ec.created_at, jsonb_build_object(
                 'id', ec.id, 'created_at', ec.created_at, 'tipo', ec.tipo,
                 'actor', coalesce((select full_name from public.profiles where id = ec.actor_id), 'El sistema'),
                 'puesto', ec.posicion_nombre,
                 'persona', (select full_name from public.profiles where id = ec.user_id),
                 'puesto_antes', ec.puesto_antes, 'puesto_despues', ec.puesto_despues,
                 'camara_antes', ec.camara_antes, 'camara_despues', ec.camara_despues,
                 'pantalla_antes', ec.pantalla_antes, 'pantalla_despues', ec.pantalla_despues,
                 'afectados', jsonb_array_length(ec.afectados)) as j
          from public.exigencias_cambios ec
         where public.es_dueno(yo.uid) or public.tiene_funcion(yo.uid, 'N:camara_pantalla.decidir')
            or public.tiene_funcion(yo.uid, 'N:horarios.gestionar')
         order by ec.created_at desc limit 12
      ) c), '[]'::jsonb)
  )
  from yo;
$$;
grant execute on function public.exigencias_por_puesto() to authenticated;

create or replace function public.posicion_exigencias_guardar(_posicion uuid, _camara boolean, _pantalla boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_cambiar_exigencias((select auth.uid()), _posicion) then
    raise exception 'No puedes cambiar la cámara ni la pantalla de este puesto' using errcode = '42501';
  end if;
  -- Solo esta columna: no se re-aplican todas las posiciones (eso es del dueño);
  -- la nota y la gracia se ponen al día aquí mismo.
  perform set_config('maven.posiciones_aplicando', 'on', true);
  update public.posiciones_borrador
     set pide_camara = coalesce(_camara, pide_camara), pide_pantalla = coalesce(_pantalla, pide_pantalla), updated_at = now()
   where id = _posicion;
  perform public.exigencias_sincronizar();
  perform set_config('maven.posiciones_aplicando', '', true);
end $$;
grant execute on function public.posicion_exigencias_guardar(uuid, boolean, boolean) to authenticated;

-- 10) El correo: la base dice qué falta mandar; detectar-tardanzas lo manda.
create or replace function public.exigencias_por_correo()
returns setof jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
           'id', ec.id, 'tipo', ec.tipo, 'created_at', ec.created_at,
           'actor', coalesce((select full_name from public.profiles where id = ec.actor_id), 'El sistema'),
           'puesto', ec.posicion_nombre,
           'persona', (select full_name from public.profiles where id = ec.user_id),
           'puesto_antes', ec.puesto_antes, 'puesto_despues', ec.puesto_despues,
           'camara_antes', ec.camara_antes, 'camara_despues', ec.camara_despues,
           'pantalla_antes', ec.pantalla_antes, 'pantalla_despues', ec.pantalla_despues,
           'afectados', ec.afectados, 'destinatarios', to_jsonb(ec.destinatarios),
           'empresa', t.name, 'marca_nombre', t.marca_nombre, 'marca_logo_url', t.marca_logo_url)
    from public.exigencias_cambios ec
    left join public.tenants t on t.id = ec.tenant_id
   where ec.correo_enviado_at is null and ec.correo_intentos < 8
     and ec.created_at > now() - interval '3 days'
   order by ec.created_at
   limit 20;
$$;
revoke all on function public.exigencias_por_correo() from public, anon, authenticated;
grant execute on function public.exigencias_por_correo() to service_role;

create or replace function public.exigencias_marcar_correo(_id uuid, _correo_a text[], _ok boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.exigencias_cambios
     set correo_enviado_at = case when _ok then now() else correo_enviado_at end,
         correo_a = case when _ok then _correo_a else correo_a end,
         correo_intentos = correo_intentos + case when _ok then 0 else 1 end
   where id = _id;
$$;
revoke all on function public.exigencias_marcar_correo(uuid, text[], boolean) from public, anon, authenticated;
grant execute on function public.exigencias_marcar_correo(uuid, text[], boolean) to service_role;

-- 11) Arranque (sin avisos ni correos: es el punto de partida, no un cambio).
do $$
declare v_closer uuid; v_externo uuid;
begin
  perform set_config('maven.exigencias_silencio', 'on', true);

  -- No piden cámara ni pantalla (ni Argos): Dueño, Admin, Operations Sales y Freelance.
  update public.posiciones_borrador
     set pide_camara = false, pide_pantalla = false
   where acceso_total or nombre = 'Dueño' or rol = 'admin' or nombre in ('Operations Sales', 'Freelance');

  -- Los admins deciden la cámara y la pantalla de los demás puestos.
  update public.posiciones_borrador
     set checks = coalesce(checks, '{}'::jsonb) || '{"N:camara_pantalla.decidir": true}'::jsonb
   where rol = 'admin';

  -- «Closer externo»: los mismos permisos que Closer (comparte su rol), sin
  -- cámara ni pantalla. Juan Pachas pasa ahí.
  select id into v_closer from public.posiciones_borrador where nombre = 'Closer' limit 1;
  select id into v_externo from public.posiciones_borrador where nombre = 'Closer externo' limit 1;
  if v_closer is not null and v_externo is null then
    insert into public.posiciones_borrador (nombre, descripcion, activa, acceso_total, todas_creadoras, checks, alcances,
                                            orden, rol, modalidad_id, pide_camara, pide_pantalla)
    select 'Closer externo', 'Cierra ventas por fuera: los mismos permisos que Closer, sin cámara ni pantalla (ni Argos).',
           activa, false, todas_creadoras, checks, alcances, orden, null, modalidad_id, false, false
      from public.posiciones_borrador where id = v_closer
    returning id into v_externo;
  end if;
  if v_closer is not null and v_externo is not null then
    update public.posiciones_borrador_personas
       set posicion_id = v_externo
     where user_id = '75bca8d9-ded5-4e86-b591-88209f6a5e6c' and posicion_id = v_closer;
  end if;

  perform public.exigencias_sincronizar();

  insert into public.exigencias_estado (user_id, camara, pantalla, puestos, actualizado)
  select pr.id, public.exige_camara(pr.id), public.exige_pantalla(pr.id),
         (select string_agg(b.nombre, ' + ' order by b.orden) from public.posiciones_borrador_personas a
            join public.posiciones_borrador b on b.id = a.posicion_id where a.user_id = pr.id), now()
    from public.profiles pr
   where pr.deleted_at is null and exists (select 1 from public.posiciones_borrador_personas pp where pp.user_id = pr.id)
  on conflict (user_id) do update set camara = excluded.camara, pantalla = excluded.pantalla,
                                      puestos = excluded.puestos, actualizado = now();
end $$;
