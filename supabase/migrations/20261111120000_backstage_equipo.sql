-- BACKSTAGE MANDA EL EQUIPO (decisión de Alvaro, 11/11/2026: «todos los roles
-- conectados con Backstage»).
--
-- Backstage, la plataforma externa de la agencia, manda sobre quién está en el equipo,
-- su rol, su equipo y a quién reporta cada persona. Maven «abre la puerta»: Backstage
-- empuja la lista completa a POST /public-api/equipo/sync con una API key que tiene el
-- scope equipo:write. Si alguien sale o queda inactivo en Backstage, en Maven va a la
-- papelera (profiles.deleted_at, 30 días, igual que «Eliminar» en la app): las cuentas
-- nunca se borran de verdad.
--
-- SEGURO POR DEFECTO:
--   · ENSAYO. Mientras integracion_equipo.aplicar = false (así nace para toda agencia),
--     la base NO cambia nada: valida cada cambio, contesta qué haría y lo anota. Lo
--     prende el dueño de la agencia cuando el ensayo se ve bien.
--   · Nunca toca a un admin ni a un dueño (equipo_protegido), y nunca sube a nadie a
--     un rol de admin ni a nivel admin/dueño: eso se hace a mano en Maven.
--   · Nunca crea cuentas (las que faltan se reportan) y nunca manda a la papelera a
--     alguien por NO venir en la lista: solo por venir con activo = false.
--   · Freno de bajas: si un envío trae más bajas que max_bajas_por_sync (5 al nacer),
--     no se aplica ninguna de esas bajas (un error de Backstage no vacía el equipo).
--   · Cada envío queda anotado en integracion_equipo_syncs (quién, cuándo, qué).
--   · Agencia: todo se cruza con la agencia de la llave (api_keys.tenant_id); una llave
--     nunca ve ni toca personas de otra agencia.
--
-- LA PARED ES LA BASE. Las dos RPC (api_equipo_estado y api_equipo_aplicar) solo sirven
-- con una sesión de API key (el claim `mvk` que arma public-api con la sesión de la
-- persona de la llave), con el scope equipo:write, y si esa persona es admin o dueña de
-- la agencia de la llave. La edge calcula las diferencias (public-api/equipo-logica.ts)
-- y aquí se vuelve a validar cada cambio antes de aplicarlo.
--
-- Dónde vive cada dato: rol → user_roles (como «Cambiar rol» en la app); nivel y
-- horario → profiles; equipo y a quién reporta → integracion_equipo_personas, porque
-- Maven no los guardaba (hoy el equipo se deduce del rol con equipo_de). Usarlos en la
-- supervisión (Pulso, Argos) es un paso aparte.

set local lock_timeout = '3s';

-- ─── 1. El interruptor por agencia ───────────────────────────────────────────

create table if not exists public.integracion_equipo (
  tenant_id          uuid primary key references public.tenants(id) on delete cascade,
  -- false = ensayo: Backstage puede mandar, pero no se aplica nada.
  aplicar            boolean not null default false,
  -- Más bajas que esto en un solo envío no se aplican (ninguna de ellas).
  max_bajas_por_sync integer not null default 5 check (max_bajas_por_sync between 0 and 500),
  -- Nombre de rol en Backstage → nombre exacto del rol en Maven, cuando no coinciden.
  mapa_roles         jsonb not null default '{}'::jsonb check (jsonb_typeof(mapa_roles) = 'object'),
  -- Lo último que llegó (resumen corto) y cuándo.
  ultima_sync        jsonb,
  ultima_sync_at     timestamptz,
  actualizado_at     timestamptz not null default now(),
  actualizado_por    uuid references auth.users(id) on delete set null
);

comment on table public.integracion_equipo is
  'Backstage → equipo de Maven, por agencia. aplicar = false es ensayo (no cambia nada). Lo prende el dueño.';

-- Toda agencia nace en ensayo.
insert into public.integracion_equipo (tenant_id)
select t.id from public.tenants t
on conflict (tenant_id) do nothing;

-- ─── 2. Equipo y jefe de cada persona, según Backstage ───────────────────────

create table if not exists public.integracion_equipo_personas (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  equipo         text check (equipo is null or char_length(equipo) between 1 and 80),
  reporta_a      uuid references auth.users(id) on delete set null,
  actualizado_at timestamptz not null default now(),
  constraint integracion_equipo_personas_no_se_reporta_a_si check (reporta_a is distinct from user_id)
);
create index if not exists integracion_equipo_personas_por_agencia on public.integracion_equipo_personas (tenant_id);
create index if not exists integracion_equipo_personas_por_jefe on public.integracion_equipo_personas (reporta_a);

-- ─── 3. La bitácora de cada envío ────────────────────────────────────────────

create table if not exists public.integracion_equipo_syncs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  api_key_id      uuid references public.api_keys(id) on delete set null,
  actor_id        uuid references auth.users(id) on delete set null,
  ensayo          boolean not null,
  recibidas       integer not null default 0,
  -- Lo que la edge calculó: cambios, pendientes de crear, roles desconocidos,
  -- protegidos, los que no vinieron, los rechazados.
  resumen         jsonb not null,
  -- Lo que la base aplicó (o, en ensayo, habría aplicado) y lo que rechazó.
  aplicados       jsonb not null default '[]'::jsonb,
  rechazados_base jsonb not null default '[]'::jsonb,
  -- Un envío igual al anterior y sin nada aplicado no suma fila: suma repeticiones.
  huella          text not null,
  repeticiones    integer not null default 1,
  created_at      timestamptz not null default now(),
  ultima_vez      timestamptz not null default now()
);
create index if not exists integracion_equipo_syncs_por_agencia on public.integracion_equipo_syncs (tenant_id, created_at desc);

-- ─── 4. Quién ve y quién cambia ──────────────────────────────────────────────
-- Ver: admins y dueños de la agencia. Cambiar el interruptor, el freno y el mapa de
-- roles: solo el dueño. Escribir lo demás: solo las RPC de abajo (DEFINER).

alter table public.integracion_equipo enable row level security;
alter table public.integracion_equipo_personas enable row level security;
alter table public.integracion_equipo_syncs enable row level security;

revoke all on public.integracion_equipo from anon, authenticated;
revoke all on public.integracion_equipo_personas from anon, authenticated;
revoke all on public.integracion_equipo_syncs from anon, authenticated;
grant select on public.integracion_equipo to authenticated;
grant update (aplicar, max_bajas_por_sync, mapa_roles) on public.integracion_equipo to authenticated;
grant select on public.integracion_equipo_personas to authenticated;
grant select on public.integracion_equipo_syncs to authenticated;

create policy integracion_equipo_ver on public.integracion_equipo
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.es_admin_o_dueno((select auth.uid()))));

create policy integracion_equipo_lo_cambia_el_dueno on public.integracion_equipo
  for update to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and exists (select 1 from public.tenant_owners o
                 where o.tenant_id = integracion_equipo.tenant_id and o.user_id = (select auth.uid()))
  )
  with check (
    tenant_id = (select public.current_tenant_id())
    and exists (select 1 from public.tenant_owners o
                 where o.tenant_id = integracion_equipo.tenant_id and o.user_id = (select auth.uid()))
  );

create policy integracion_equipo_personas_ver on public.integracion_equipo_personas
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.es_admin_o_dueno((select auth.uid()))));

create policy integracion_equipo_syncs_ver on public.integracion_equipo_syncs
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.es_admin_o_dueno((select auth.uid()))));

-- Quién cambió el interruptor y cuándo.
create or replace function public.integracion_equipo_sello()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.actualizado_at := now();
  new.actualizado_por := coalesce(auth.uid(), new.actualizado_por);
  return new;
end;
$$;
revoke all on function public.integracion_equipo_sello() from public, anon, authenticated;

drop trigger if exists integracion_equipo_sello on public.integracion_equipo;
create trigger integracion_equipo_sello
  before update of aplicar, max_bajas_por_sync, mapa_roles on public.integracion_equipo
  for each row execute function public.integracion_equipo_sello();

-- ─── 5. Protegidos: a estos Backstage no los toca nunca ──────────────────────

create or replace function public.equipo_protegido(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin_o_dueno(_uid)
      or public.is_in_role_group(_uid, 'admin')
      or exists (select 1 from public.profiles p where p.id = _uid and p.nivel in ('dueno', 'admin'));
$$;
revoke all on function public.equipo_protegido(uuid) from public, anon, authenticated;

-- ─── 6. La llave del pedido ──────────────────────────────────────────────────
-- Interna (la llaman las dos RPC): la key del claim `mvk` existe, no está revocada ni
-- vencida, actúa como quien hace el pedido, tiene equipo:write, su persona sigue
-- vigente en la agencia de la key, y esa persona es admin o dueña de ESA agencia.

create or replace function public.api_equipo_llave()
returns public.api_keys
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _id uuid := public.api_mvk();
  _yo uuid := auth.uid();
  _k public.api_keys;
begin
  if _id is null then
    raise exception using errcode = 'MV401',
      message = 'api_sin_llave: este pedido no viene de una key',
      detail = '{"error": "unauthorized"}';
  end if;
  select * into _k from public.api_keys k where k.id = _id;
  if not found
     or _k.revoked_at is not null
     or (_k.expires_at is not null and _k.expires_at <= now())
     or _yo is null
     or _k.acts_as_user_id is distinct from _yo then
    raise exception using errcode = 'MV401',
      message = 'api_llave_invalida: la key del pedido no existe, está revocada, venció o no es de esta persona',
      detail = '{"error": "unauthorized"}';
  end if;
  if not ('equipo:write' = any (_k.scopes)) then
    raise exception using errcode = 'MV403',
      message = 'api_llave_sin_permiso: la key no tiene equipo:write',
      detail = '{"error": "forbidden"}';
  end if;
  if _k.tenant_id is null
     or not public.api_key_persona_vigente(_yo, _k.tenant_id)
     or _k.tenant_id is distinct from public.current_tenant_id() then
    raise exception using errcode = 'MV403',
      message = 'api_persona_no_vigente: la persona de la key ya no está activa en su agencia',
      detail = '{"error": "forbidden"}';
  end if;
  if not (exists (select 1 from public.tenant_owners o where o.user_id = _yo and o.tenant_id = _k.tenant_id)
          or exists (select 1 from public.user_roles ur
                      where ur.user_id = _yo and lower(ur.role) = 'admin' and ur.tenant_id = _k.tenant_id)) then
    raise exception using errcode = 'MV403',
      message = 'api_equipo_sin_permiso: la persona de la key no es admin ni dueña de su agencia',
      detail = '{"error": "forbidden"}';
  end if;
  return _k;
end;
$$;
revoke all on function public.api_equipo_llave() from public, anon, authenticated;

-- ─── 7. Lo que Maven tiene hoy (para comparar) ───────────────────────────────
-- Las personas de la agencia de la key (también las de la papelera; sin las cuentas
-- externas de creadoras), con su correo, rol, nivel, horario, equipo y jefe, y si
-- están protegidas. Más los roles activos de la agencia y el interruptor.

create or replace function public.api_equipo_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _cfg public.integracion_equipo;
begin
  select * into _cfg from public.integracion_equipo c where c.tenant_id = _k.tenant_id;
  return jsonb_build_object(
    'agencia', _k.tenant_id,
    'aplicar', coalesce(_cfg.aplicar, false),
    'max_bajas', coalesce(_cfg.max_bajas_por_sync, 5),
    'mapa_roles', coalesce(_cfg.mapa_roles, '{}'::jsonb),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', rc.name,
               'es_admin', lower(rc.name) = 'admin' or coalesce(rg.is_admin, false))
             order by rc.name)
        from public.roles_config rc
        left join public.role_groups rg on rg.role_name = rc.name and rg.tenant_id = rc.tenant_id
       where rc.tenant_id = _k.tenant_id and rc.is_active
    ), '[]'::jsonb),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'correo', lower(u.email),
               'nombre', p.full_name,
               'rol', (select ur.role from public.user_roles ur
                        where ur.user_id = p.id and ur.tenant_id = _k.tenant_id
                        order by ur.role limit 1),
               'nivel', p.nivel,
               'hora_entrada', p.hora_entrada::text,
               'hora_salida', p.hora_salida::text,
               'equipo', ip.equipo,
               'reporta_a', ip.reporta_a,
               'en_papelera', p.deleted_at is not null,
               'protegido', public.equipo_protegido(p.id))
             order by p.id)
        from public.tenant_members tm
        join public.profiles p on p.id = tm.user_id
        join auth.users u on u.id = p.id
        left join public.integracion_equipo_personas ip on ip.user_id = p.id and ip.tenant_id = _k.tenant_id
       where tm.tenant_id = _k.tenant_id
         and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora'
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.api_equipo_estado() from public, anon;
grant execute on function public.api_equipo_estado() to authenticated;

-- ─── 8. Aplicar (o ensayar) los cambios ──────────────────────────────────────
-- _cambios: [{ user_id, campo, valor }] con campo en rol | nivel | equipo | reporta_a |
-- hora_entrada | hora_salida | papelera. Cada uno se valida otra vez aquí; los que no
-- pasan van a `rechazados` con su motivo y los demás se aplican, salvo en ensayo
-- (el interruptor apagado o el pedido con ensayo = true), donde solo se dice qué pasaría.
-- _resumen: lo que la edge calculó, para la bitácora.

create or replace function public.api_equipo_aplicar(_cambios jsonb, _resumen jsonb, _ensayo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _k public.api_keys := public.api_equipo_llave();
  _yo uuid := auth.uid();
  _cfg public.integracion_equipo;
  _ensayo_final boolean;
  _bajas integer;
  _c jsonb;
  _uid uuid;
  _campo text;
  _txt text;
  _jefe uuid;
  _motivo text;
  _aplicados jsonb := '[]'::jsonb;
  _rechazados jsonb := '[]'::jsonb;
  _huella text;
  _ultima_id uuid;
  _ultima_huella text;
  _ultima_ensayo boolean;
  _sync uuid;
  _recibidas integer;
begin
  if _cambios is null or jsonb_typeof(_cambios) <> 'array' or jsonb_array_length(_cambios) > 10000 then
    raise exception 'api_equipo_aplicar: _cambios tiene que ser una lista (hasta 10.000)';
  end if;
  if _resumen is null or jsonb_typeof(_resumen) <> 'object' or pg_column_size(_resumen) > 4000000 then
    raise exception 'api_equipo_aplicar: _resumen tiene que ser un objeto (hasta 4 MB)';
  end if;

  -- Un envío a la vez por agencia: dos a la vez se pisarían.
  perform pg_advisory_xact_lock(hashtextextended('integracion_equipo:' || _k.tenant_id::text, 0));

  insert into public.integracion_equipo (tenant_id) values (_k.tenant_id) on conflict (tenant_id) do nothing;
  select * into _cfg from public.integracion_equipo c where c.tenant_id = _k.tenant_id for update;
  _ensayo_final := coalesce(_ensayo, false) or not _cfg.aplicar;

  select count(*) into _bajas from jsonb_array_elements(_cambios) as x(v) where x.v ->> 'campo' = 'papelera';

  -- Las bajas al final: un cambio de jefe hacia alguien que se va en este mismo envío
  -- se valida antes de que se vaya.
  for _c in
    select x.v from jsonb_array_elements(_cambios) as x(v) order by (x.v ->> 'campo' = 'papelera')
  loop
    _motivo := null;
    _campo := _c ->> 'campo';
    _uid := null;
    _jefe := null;
    _txt := null;
    begin
      _uid := (_c ->> 'user_id')::uuid;
    exception when others then
      _motivo := 'user_id_invalido';
    end;

    if _motivo is null and (_uid is null or not exists (
         select 1 from public.tenant_members tm
           join public.profiles p on p.id = tm.user_id
           join auth.users u on u.id = p.id
          where tm.user_id = _uid and tm.tenant_id = _k.tenant_id
            and coalesce(u.raw_app_meta_data ->> 'tipo', '') <> 'creadora')) then
      _motivo := 'no_es_de_la_agencia';
    end if;
    if _motivo is null and (_uid = _yo or public.equipo_protegido(_uid)) then
      _motivo := 'protegido';
    end if;
    if _motivo is null and exists (select 1 from public.profiles p where p.id = _uid and p.deleted_at is not null) then
      _motivo := 'en_papelera';
    end if;

    if _motivo is null then
      -- El valor: texto o null (nada de números ni objetos).
      if _c -> 'valor' is null or jsonb_typeof(_c -> 'valor') = 'null' then
        _txt := null;
      elsif jsonb_typeof(_c -> 'valor') = 'string' then
        _txt := _c ->> 'valor';
      else
        _motivo := 'valor_invalido';
      end if;
    end if;

    if _motivo is null then
      case _campo
        when 'rol' then
          if _txt is null or not exists (
               select 1 from public.roles_config rc
                where rc.tenant_id = _k.tenant_id and rc.is_active and rc.name = _txt) then
            _motivo := 'rol_desconocido';
          elsif lower(_txt) = 'admin' or exists (
               select 1 from public.role_groups rg
                where rg.role_name = _txt and rg.tenant_id = _k.tenant_id and rg.is_admin) then
            _motivo := 'rol_de_admin';
          end if;
        when 'nivel' then
          if _txt is null or _txt not in ('manager', 'supervisor', 'agente') then
            _motivo := 'nivel_no_permitido';
          end if;
        when 'equipo' then
          if _txt is not null and (char_length(_txt) not between 1 and 80) then
            _motivo := 'equipo_invalido';
          end if;
        when 'reporta_a' then
          if _txt is not null then
            begin
              _jefe := _txt::uuid;
            exception when others then
              _motivo := 'jefe_invalido';
            end;
            if _motivo is null and _jefe = _uid then
              _motivo := 'jefe_es_la_misma_persona';
            elsif _motivo is null and not exists (
                 select 1 from public.tenant_members tm
                   join public.profiles p on p.id = tm.user_id
                  where tm.user_id = _jefe and tm.tenant_id = _k.tenant_id and p.deleted_at is null) then
              _motivo := 'jefe_no_esta_en_la_agencia';
            end if;
          end if;
        when 'hora_entrada', 'hora_salida' then
          if _txt is not null and _txt !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
            _motivo := 'hora_invalida';
          end if;
        when 'papelera' then
          if _bajas > _cfg.max_bajas_por_sync then
            _motivo := 'freno_de_bajas';
          end if;
        else
          _motivo := 'campo_desconocido';
      end case;
    end if;

    if _motivo is not null then
      _rechazados := _rechazados || jsonb_build_object('user_id', _c ->> 'user_id', 'campo', _campo, 'motivo', _motivo);
      continue;
    end if;

    if not _ensayo_final then
      begin
        case _campo
          when 'rol' then
            if exists (select 1 from public.user_roles ur where ur.user_id = _uid) then
              -- Una persona, un rol (como «Cambiar rol» en la app).
              delete from public.user_roles ur
               where ur.user_id = _uid
                 and ur.id <> (select x.id from public.user_roles x where x.user_id = _uid
                                order by (x.role = _txt) desc, x.role limit 1);
              update public.user_roles set role = _txt where user_id = _uid and role is distinct from _txt;
            else
              insert into public.user_roles (user_id, role) values (_uid, _txt);
            end if;
          when 'nivel' then
            update public.profiles set nivel = _txt where id = _uid;
          when 'equipo' then
            insert into public.integracion_equipo_personas (user_id, tenant_id, equipo)
            values (_uid, _k.tenant_id, _txt)
            on conflict (user_id) do update
              set equipo = excluded.equipo, tenant_id = excluded.tenant_id, actualizado_at = now();
          when 'reporta_a' then
            insert into public.integracion_equipo_personas (user_id, tenant_id, reporta_a)
            values (_uid, _k.tenant_id, _jefe)
            on conflict (user_id) do update
              set reporta_a = excluded.reporta_a, tenant_id = excluded.tenant_id, actualizado_at = now();
          when 'hora_entrada' then
            update public.profiles set hora_entrada = _txt::time where id = _uid;
          when 'hora_salida' then
            update public.profiles set hora_salida = _txt::time where id = _uid;
          when 'papelera' then
            -- Lo mismo que «Eliminar» en la app (admin-user-actions, delete_user): fuera
            -- de la sesión, bloqueada la entrada, marcado el perfil y anotado. El buzón
            -- de Zoho no se toca: se borra al purgar, a los 30 días.
            update public.profiles set deleted_at = now(), deleted_by = _yo where id = _uid and deleted_at is null;
            perform public.app_revoke_user_sessions(_uid);
            update auth.users set banned_until = now() + interval '876000 hours' where id = _uid;
            insert into public.cuenta_eventos (user_id, user_email, user_full_name, accion, actor_id, actor_email, detalle)
            select _uid, u.email, p.full_name, 'eliminada', _yo,
                   (select a.email from auth.users a where a.id = _yo),
                   jsonb_build_object('origen', 'backstage', 'api_key_id', _k.id)
              from auth.users u join public.profiles p on p.id = u.id
             where u.id = _uid;
        end case;
      exception when others then
        _rechazados := _rechazados || jsonb_build_object('user_id', _uid, 'campo', _campo, 'motivo', 'error_de_base',
                                                         'detalle', left(sqlerrm, 200));
        continue;
      end;
    end if;

    _aplicados := _aplicados || jsonb_build_object('user_id', _uid, 'campo', _campo);
  end loop;

  -- La bitácora: un envío igual al último (misma huella, mismo modo) y sin nada
  -- aplicado no suma fila, suma una repetición.
  _huella := md5(_resumen::text);
  _recibidas := case when jsonb_typeof(_resumen -> 'recibidas') = 'number' then (_resumen ->> 'recibidas')::integer else 0 end;
  select s.id, s.huella, s.ensayo into _ultima_id, _ultima_huella, _ultima_ensayo
    from public.integracion_equipo_syncs s
   where s.tenant_id = _k.tenant_id
   order by s.created_at desc
   limit 1;
  if _ultima_id is not null and _ultima_huella = _huella and _ultima_ensayo = _ensayo_final
     and (_ensayo_final or jsonb_array_length(_aplicados) = 0) then
    update public.integracion_equipo_syncs
       set repeticiones = repeticiones + 1, ultima_vez = now()
     where id = _ultima_id;
    _sync := _ultima_id;
  else
    insert into public.integracion_equipo_syncs
      (tenant_id, api_key_id, actor_id, ensayo, recibidas, resumen, aplicados, rechazados_base, huella)
    values
      (_k.tenant_id, _k.id, _yo, _ensayo_final, _recibidas, _resumen, _aplicados, _rechazados, _huella)
    returning id into _sync;
  end if;

  update public.integracion_equipo
     set ultima_sync = jsonb_build_object(
           'sync_id', _sync,
           'ensayo', _ensayo_final,
           'recibidas', _recibidas,
           'cambios', jsonb_array_length(_cambios),
           'aplicados', case when _ensayo_final then 0 else jsonb_array_length(_aplicados) end,
           'rechazados', jsonb_array_length(_rechazados)),
         ultima_sync_at = now()
   where tenant_id = _k.tenant_id;

  return jsonb_build_object(
    'ensayo', _ensayo_final,
    'aplicar', _cfg.aplicar,
    'sync_id', _sync,
    'aplicados', _aplicados,
    'rechazados', _rechazados
  );
end;
$$;
revoke all on function public.api_equipo_aplicar(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.api_equipo_aplicar(jsonb, jsonb, boolean) to authenticated;
