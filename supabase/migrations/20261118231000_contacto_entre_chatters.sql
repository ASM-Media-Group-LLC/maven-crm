-- LOS CHATTERS ENTRE SÍ (Alvaro, 18/11/2026).
--
-- Regla de Alvaro: «todo tiene que seguir funcionando como hace 7 días; no se
-- quita lo que ya andaba». Entonces:
--
--   · CHAT DIRECTO entre chatters: se puede, como siempre. Pero la PRIMERA vez
--     que dos chatters de la misma agencia abren un directo, Maven AVISA (campana
--     + push + correo) al dueño y a los admins de la agencia, y a los que la
--     agencia anote en `contacto_alertas_destinatarios`. Una sola vez por pareja
--     (`contacto_primer_contacto`). Nunca dice qué se escribieron.
--   · LLAMADA 1 a 1 entre chatters: se puede, como siempre.
--   · Lo NUEVO (llamadas tipo Skype, 20261118160000): un chatter no SUMA a otro
--     chatter a una llamada, y cuando un chatter llama a su grupo, a los otros
--     chatters no les suena. Un supervisor, manager, admin o el dueño suma a
--     quien quiera.
--
-- Genérico para cualquier agencia: cada agencia anota en
-- `contacto_roles_aislados` los roles (user_roles.role) cuyos miembros quedan
-- «aislados» entre sí. Kash arranca con 'Chatter'.
--
-- Par aislado (contacto_par_aislado(a, b) = la agencia; si no, null) solo cuando:
--   · a ≠ b, de la misma agencia (tenant_members),
--   · los dos tienen un rol aislado en esa agencia, y
--   · NINGUNO tiene nivel dueno/admin/manager/supervisor (profiles.nivel) ni el
--     rol 'admin'.
-- contacto_permitido(a, b) = no son par aislado = a puede sumar a b a una
-- llamada de grupo (y viceversa).
--
-- Los bancos PGlite parciales no traen todas las tablas: cada parte se salta si
-- falta lo que necesita (to_regclass). profiles.nivel y profiles.deleted_at se
-- leen con to_jsonb para no depender de que existan en esas bases.

-- ── Las tablas por agencia ───────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.tenants') is null or to_regclass('public.tenant_members') is null then
    return;
  end if;

  -- Los roles aislados entre sí.
  execute $t$
    create table if not exists public.contacto_roles_aislados (
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      role text not null,
      creado timestamptz not null default now(),
      primary key (tenant_id, role)
    )
  $t$;
  -- A quién más le llega el aviso del primer contacto (además del dueño y los
  -- admins de la agencia, que siempre lo reciben).
  execute $t$
    create table if not exists public.contacto_alertas_destinatarios (
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      user_id uuid not null,
      creado timestamptz not null default now(),
      primary key (tenant_id, user_id)
    )
  $t$;
  -- Las parejas que ya se hablaron (una fila por pareja: a < b). Así el aviso
  -- sale una sola vez, y el correo sabe a quién iba.
  execute $t$
    create table if not exists public.contacto_primer_contacto (
      tenant_id uuid not null references public.tenants(id) on delete cascade,
      a uuid not null,
      b uuid not null,
      conversation_id uuid,
      creado timestamptz not null default now(),
      avisado_a uuid[] not null default '{}',
      correo_a text[],
      correo_enviado_at timestamptz,
      primary key (tenant_id, a, b),
      check (a < b)
    )
  $t$;
  execute 'create index if not exists contacto_primer_contacto_sin_correo_idx on public.contacto_primer_contacto (creado) where correo_enviado_at is null';

  execute 'alter table public.contacto_roles_aislados enable row level security';
  execute 'alter table public.contacto_alertas_destinatarios enable row level security';
  execute 'alter table public.contacto_primer_contacto enable row level security';
  execute 'revoke all on public.contacto_roles_aislados, public.contacto_alertas_destinatarios, public.contacto_primer_contacto from anon';
  execute 'grant select, insert, update, delete on public.contacto_roles_aislados, public.contacto_alertas_destinatarios to authenticated';
  execute 'revoke all on public.contacto_primer_contacto from authenticated';
  execute 'grant select on public.contacto_primer_contacto to authenticated';

  -- Kash: los chatters quedan aislados entre sí (solo si la agencia existe).
  insert into public.contacto_roles_aislados (tenant_id, role)
  select t.id, 'Chatter' from public.tenants t
   where t.id = '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid
  on conflict do nothing;
  -- Kash: además del dueño y los admins, Luis Carlos Ortega.
  insert into public.contacto_alertas_destinatarios (tenant_id, user_id)
  select t.id, u.id from public.tenants t, auth.users u
   where t.id = '30869615-f579-4981-8a1f-dbebc61eae2d'::uuid
     and u.id = '41b35cef-82a8-4991-9234-3514b0064767'::uuid
  on conflict do nothing;
end $$;

-- ¿Puede quien llama tocar las listas de esta agencia? Dueño o admin de la agencia.
create or replace function public.puede_editar_contacto_aislado(_tenant uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _yo uuid := (select auth.uid());
begin
  if _yo is null or _tenant is null then
    return false;
  end if;
  if not exists (select 1 from public.tenant_members m where m.tenant_id = _tenant and m.user_id = _yo) then
    return false;
  end if;
  if exists (select 1 from public.tenant_members m
              where m.tenant_id = _tenant and m.user_id = _yo and lower(m.role) in ('owner', 'admin')) then
    return true;
  end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = _yo and lower(ur.role) = 'admin') then
    return true;
  end if;
  if to_regclass('public.tenant_owners') is not null then
    if exists (select 1 from public.tenant_owners o where o.tenant_id = _tenant and o.user_id = _yo) then
      return true;
    end if;
  end if;
  return exists (select 1 from public.profiles p
                  where p.id = _yo and (to_jsonb(p) ->> 'nivel') in ('dueno', 'admin'));
end;
$$;
revoke all on function public.puede_editar_contacto_aislado(uuid) from public, anon;
grant execute on function public.puede_editar_contacto_aislado(uuid) to authenticated, service_role;

do $$
begin
  if to_regclass('public.contacto_roles_aislados') is null then
    return;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contacto_roles_aislados'
                    and policyname = 'Ver los roles aislados de mi agencia') then
    execute $p$create policy "Ver los roles aislados de mi agencia" on public.contacto_roles_aislados
      for select to authenticated
      using (exists (select 1 from public.tenant_members m
                      where m.tenant_id = contacto_roles_aislados.tenant_id
                        and m.user_id = (select auth.uid())))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contacto_roles_aislados'
                    and policyname = 'Dueño y admins editan los roles aislados') then
    execute $p$create policy "Dueño y admins editan los roles aislados" on public.contacto_roles_aislados
      for all to authenticated
      using (public.puede_editar_contacto_aislado(tenant_id))
      with check (public.puede_editar_contacto_aislado(tenant_id))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contacto_alertas_destinatarios'
                    and policyname = 'Dueño y admins manejan a quién le llega el aviso') then
    execute $p$create policy "Dueño y admins manejan a quién le llega el aviso" on public.contacto_alertas_destinatarios
      for all to authenticated
      using (public.puede_editar_contacto_aislado(tenant_id))
      with check (public.puede_editar_contacto_aislado(tenant_id))$p$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'contacto_primer_contacto'
                    and policyname = 'Dueño y admins ven los primeros contactos') then
    execute $p$create policy "Dueño y admins ven los primeros contactos" on public.contacto_primer_contacto
      for select to authenticated
      using (public.puede_editar_contacto_aislado(tenant_id))$p$;
  end if;
end $$;

-- ── La regla ─────────────────────────────────────────────────────────────────
-- Quien manda (nivel dueno/admin/manager/supervisor o rol 'admin') no queda aislado.
create or replace function public.contacto_es_de_mando(_persona uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (select 1 from public.profiles p
                  where p.id = _persona
                    and (to_jsonb(p) ->> 'nivel') in ('dueno', 'admin', 'manager', 'supervisor'))
      or exists (select 1 from public.user_roles ur
                  where ur.user_id = _persona and lower(ur.role) = 'admin');
end;
$$;
revoke all on function public.contacto_es_de_mando(uuid) from public, anon, authenticated;
grant execute on function public.contacto_es_de_mando(uuid) to service_role;

-- La agencia en la que `_a` y `_b` son un par aislado; null si no lo son.
create or replace function public.contacto_par_aislado(_a uuid, _b uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _t uuid;
begin
  if _a is null or _b is null or _a = _b or to_regclass('public.contacto_roles_aislados') is null then
    return null;
  end if;
  select ra.tenant_id into _t
    from public.contacto_roles_aislados ra
    join public.tenant_members ma on ma.tenant_id = ra.tenant_id and ma.user_id = _a
    join public.user_roles ua on ua.user_id = _a and lower(ua.role) = lower(ra.role)
    join public.tenant_members mb on mb.tenant_id = ra.tenant_id and mb.user_id = _b
    join public.contacto_roles_aislados rb on rb.tenant_id = ra.tenant_id
    join public.user_roles ub on ub.user_id = _b and lower(ub.role) = lower(rb.role)
   limit 1;
  if _t is null then
    return null;
  end if;
  if public.contacto_es_de_mando(_a) or public.contacto_es_de_mando(_b) then
    return null;
  end if;
  return _t;
end;
$$;
revoke all on function public.contacto_par_aislado(uuid, uuid) from public, anon, authenticated;
grant execute on function public.contacto_par_aislado(uuid, uuid) to service_role;

-- ¿Puede `_a` sumar a `_b` a una llamada de grupo (y al revés)? = no son par aislado.
create or replace function public.contacto_permitido(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.contacto_par_aislado(_a, _b) is null
$$;
revoke all on function public.contacto_permitido(uuid, uuid) from public, anon;
grant execute on function public.contacto_permitido(uuid, uuid) to authenticated, service_role;

-- LLAMADAS (Alvaro, 18/11/2026: «un chatter solo puede llamar a su supervisor,
-- punto»). ¿`_persona` tiene un rol aislado en su agencia y no es de mando?
create or replace function public.contacto_es_aislado(_persona uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if _persona is null or to_regclass('public.contacto_roles_aislados') is null then
    return false;
  end if;
  return exists (select 1
                   from public.contacto_roles_aislados ra
                   join public.tenant_members ma on ma.tenant_id = ra.tenant_id and ma.user_id = _persona
                   join public.user_roles ua on ua.user_id = _persona and lower(ua.role) = lower(ra.role))
     and not public.contacto_es_de_mando(_persona);
end;
$$;
revoke all on function public.contacto_es_aislado(uuid) from public, anon, authenticated;
grant execute on function public.contacto_es_aislado(uuid) to service_role;

-- ¿Se pueden llamar `_a` y `_b` (1 a 1, sumarse o sonar en grupo)? Si uno es
-- aislado (un chatter), el otro tiene que ser de mando (supervisor, manager,
-- admin o dueño). Los mensajes no pasan por aquí: siguen como siempre.
create or replace function public.llamada_permitida(_a uuid, _b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _a is null or _b is null or _a = _b
      or ((not public.contacto_es_aislado(_a) or public.contacto_es_de_mando(_b))
      and (not public.contacto_es_aislado(_b) or public.contacto_es_de_mando(_a)))
$$;
revoke all on function public.llamada_permitida(uuid, uuid) from public, anon;
grant execute on function public.llamada_permitida(uuid, uuid) to authenticated, service_role;

-- Las personas que `_quien` no puede sumar a una llamada (ni hacer sonar).
create or replace function public.contactos_restringidos_de(_quien uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if _quien is null or to_regclass('public.contacto_roles_aislados') is null then
    return;
  end if;
  if public.contacto_es_de_mando(_quien) then
    return;
  end if;
  if public.contacto_es_aislado(_quien) then
    -- Un chatter: todos los de su agencia que no son de mando.
    return query
      select distinct mb.user_id
        from public.tenant_members ma
        join public.tenant_members mb on mb.tenant_id = ma.tenant_id and mb.user_id <> _quien
       where ma.user_id = _quien
         and not public.contacto_es_de_mando(mb.user_id);
    return;
  end if;
  -- Cualquier otro que no es de mando: no llama a los chatters de su agencia.
  return query
    select distinct mb.user_id
      from public.tenant_members ma
      join public.contacto_roles_aislados rb on rb.tenant_id = ma.tenant_id
      join public.tenant_members mb on mb.tenant_id = ma.tenant_id and mb.user_id <> _quien
      join public.user_roles ub on ub.user_id = mb.user_id and lower(ub.role) = lower(rb.role)
     where ma.user_id = _quien
       and not public.contacto_es_de_mando(mb.user_id);
end;
$$;
revoke all on function public.contactos_restringidos_de(uuid) from public, anon, authenticated;
grant execute on function public.contactos_restringidos_de(uuid) to service_role;

-- Para la app: a quiénes NO puedo sumar a una llamada (solo filtra; la pared es la base).
create or replace function public.contactos_restringidos()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select public.contactos_restringidos_de((select auth.uid()))
$$;
revoke all on function public.contactos_restringidos() from public, anon;
grant execute on function public.contactos_restringidos() to authenticated, service_role;

-- ── Aviso del primer contacto ────────────────────────────────────────────────
-- A quién le llega: el dueño y los admins de la agencia (vivos, no en la
-- papelera) y los anotados en contacto_alertas_destinatarios. Sin repetidos.
create or replace function public.contacto_alertas_para(_tenant uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  _ids uuid[];
  _duenos uuid[] := '{}';
begin
  if _tenant is null then
    return;
  end if;
  _ids := array(
    select m.user_id
      from public.tenant_members m
     where m.tenant_id = _tenant
       and ((select to_jsonb(p) ->> 'nivel' from public.profiles p where p.id = m.user_id) in ('dueno', 'admin')
            or lower(m.role) = 'owner'
            or exists (select 1 from public.user_roles ur where ur.user_id = m.user_id and lower(ur.role) = 'admin'))
    union
    select d.user_id from public.contacto_alertas_destinatarios d where d.tenant_id = _tenant
  );
  if to_regclass('public.tenant_owners') is not null then
    execute 'select coalesce(array_agg(o.user_id), ''{}'') from public.tenant_owners o where o.tenant_id = $1'
      into _duenos using _tenant;
  end if;
  -- Solo gente viva (no en la papelera), sin repetidos.
  return query
    select distinct x
      from unnest(_ids || _duenos) x
      join public.profiles p on p.id = x
     where (to_jsonb(p) ->> 'deleted_at') is null;
end;
$$;
revoke all on function public.contacto_alertas_para(uuid) from public, anon, authenticated;
grant execute on function public.contacto_alertas_para(uuid) to service_role;

-- Al sumarse alguien a un DIRECTO: si con el otro son un par aislado que nunca
-- se había hablado, se anota la pareja y se avisa (campana + push; el correo lo
-- manda detectar-tardanzas leyendo contacto_primer_contacto_por_correo).
-- Nunca frena el chat: si algo falla, solo deja un warning.
create or replace function public.chat_participants_primer_contacto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _otro uuid;
  _t uuid;
  _a uuid;
  _b uuid;
  _dest uuid[];
  _nombre_a text;
  _nombre_b text;
  _nuevo boolean;
begin
  if not exists (select 1 from public.chat_conversations c
                  where c.id = new.conversation_id and c.type = 'direct') then
    return new;
  end if;
  for _otro in
    select p.user_id from public.chat_participants p
     where p.conversation_id = new.conversation_id and p.user_id <> new.user_id
  loop
    _t := public.contacto_par_aislado(_otro, new.user_id);
    continue when _t is null;
    _a := least(_otro, new.user_id);
    _b := greatest(_otro, new.user_id);
    select coalesce(array_agg(x), '{}') into _dest from public.contacto_alertas_para(_t) x;
    insert into public.contacto_primer_contacto (tenant_id, a, b, conversation_id, avisado_a)
    values (_t, _a, _b, new.conversation_id, _dest)
    on conflict do nothing
    returning true into _nuevo;
    continue when _nuevo is not true;

    select coalesce(nullif(trim(full_name), ''), 'Un chatter') into _nombre_a from public.profiles where id = _a;
    select coalesce(nullif(trim(full_name), ''), 'otro chatter') into _nombre_b from public.profiles where id = _b;
    -- Si la campana falla, la pareja queda anotada igual (y el correo sale).
    begin
      insert into public.notifications
        (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
      select d, 'contacto_primer_contacto',
             format('%s y %s empezaron a hablarse por primera vez', coalesce(_nombre_a, 'Un chatter'), coalesce(_nombre_b, 'otro chatter')),
             'Abrieron un chat directo entre ellos. Maven avisa una sola vez por pareja; no se muestra lo que se escriben.',
             _a, 'profile', 'HR', 'high', 'new', 'personal', format('/hr/persona/%s', _a)
        from unnest(_dest) d
       where d not in (_a, _b);
    exception when others then
      raise warning 'chat_participants_primer_contacto (campana): %', sqlerrm;
    end;
  end loop;
  return new;
exception when others then
  raise warning 'chat_participants_primer_contacto: % (conversación %)', sqlerrm, new.conversation_id;
  return new;
end;
$$;
revoke all on function public.chat_participants_primer_contacto() from public, anon, authenticated;

-- Para el correo (lo llama detectar-tardanzas, cada 2 min, con la llave de servicio).
create or replace function public.contacto_primer_contacto_por_correo()
returns table (tenant_id uuid, a uuid, b uuid, nombre_a text, nombre_b text, creado timestamptz, destinatarios uuid[])
language sql
stable
security definer
set search_path = public
as $$
  select c.tenant_id, c.a, c.b,
         coalesce(nullif(trim(pa.full_name), ''), 'Un chatter'),
         coalesce(nullif(trim(pb.full_name), ''), 'otro chatter'),
         c.creado,
         array(select x from unnest(c.avisado_a) x where x not in (c.a, c.b))
    from public.contacto_primer_contacto c
    left join public.profiles pa on pa.id = c.a
    left join public.profiles pb on pb.id = c.b
   where c.correo_enviado_at is null
     and c.creado > now() - interval '2 days'
   order by c.creado
   limit 50
$$;

create or replace function public.contacto_primer_contacto_marcar_correo(_tenant uuid, _a uuid, _b uuid, _correo_a text[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.contacto_primer_contacto
     set correo_enviado_at = now(), correo_a = _correo_a
   where tenant_id = _tenant and a = _a and b = _b
$$;
revoke all on function public.contacto_primer_contacto_por_correo() from public, anon, authenticated;
revoke all on function public.contacto_primer_contacto_marcar_correo(uuid, uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.contacto_primer_contacto_por_correo() to service_role;
grant execute on function public.contacto_primer_contacto_marcar_correo(uuid, uuid, uuid, text[]) to service_role;

do $$
begin
  if to_regclass('public.chat_participants') is null or to_regclass('public.chat_conversations') is null
     or to_regclass('public.contacto_primer_contacto') is null then
    return;
  end if;
  -- Las parejas que YA tienen un directo no avisan: se anotan sin aviso y con
  -- el correo dado por hecho.
  insert into public.contacto_primer_contacto (tenant_id, a, b, conversation_id, creado, correo_enviado_at)
  select distinct on (t, x.a, x.b) t, x.a, x.b, x.conv, x.creado, now()
    from (
      select least(pa.user_id, pb.user_id) as a, greatest(pa.user_id, pb.user_id) as b, c.id as conv, c.created_at as creado
        from public.chat_conversations c
        join public.chat_participants pa on pa.conversation_id = c.id
        join public.chat_participants pb on pb.conversation_id = c.id and pb.user_id > pa.user_id
       where c.type = 'direct'
    ) x
    cross join lateral (select public.contacto_par_aislado(x.a, x.b) as t) par
   where par.t is not null
   order by t, x.a, x.b, x.creado
  on conflict do nothing;

  execute 'drop trigger if exists chat_participants_primer_contacto on public.chat_participants';
  execute 'create trigger chat_participants_primer_contacto after insert on public.chat_participants for each row execute function public.chat_participants_primer_contacto()';
end $$;

-- ── Sumar a una llamada (lo nuevo) ───────────────────────────────────────────
-- Se mira a quien pide (auth.uid()) y a quien figura como invitador
-- (invitado_por, que lo escribe el cliente: no se le cree solo). Entrar uno
-- mismo siempre se puede, y la llamada 1 a 1 entre quien llama y quien recibe
-- sigue como siempre. Volver a hacer sonar (status → 'ringing') es invitar.
create or replace function public.call_participants_contacto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _yo uuid := (select auth.uid());
  _por uuid := nullif(to_jsonb(new) ->> 'invitado_por', '')::uuid;
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from 'ringing' or old.status = 'ringing' then
      return new;
    end if;
  end if;
  if _yo is not null and _yo <> new.user_id and not public.llamada_permitida(_yo, new.user_id) then
    raise exception 'contacto_no_permitido: no puedes sumar a esta persona a la llamada; pídeselo a tu supervisor';
  end if;
  if _por is not null and _por <> new.user_id and not public.llamada_permitida(_por, new.user_id) then
    raise exception 'contacto_no_permitido: no puedes sumar a esta persona a la llamada; pídeselo a tu supervisor';
  end if;
  return new;
end;
$$;
revoke all on function public.call_participants_contacto() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.call_participants') is not null and to_regclass('public.calls') is not null then
    execute 'drop trigger if exists call_participants_contacto on public.call_participants';
    execute 'create trigger call_participants_contacto before insert or update of status on public.call_participants for each row execute function public.call_participants_contacto()';
  end if;
end $$;

-- La llamada 1 a 1: un chatter solo llama a (y recibe de) alguien de mando.
create or replace function public.calls_contacto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.receiver_id is not null and not public.llamada_permitida(new.caller_id, new.receiver_id) then
    raise exception 'contacto_no_permitido: un chatter solo puede llamar a su supervisor';
  end if;
  return new;
end;
$$;
revoke all on function public.calls_contacto() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.calls') is not null then
    execute 'drop trigger if exists calls_contacto on public.calls';
    execute 'create trigger calls_contacto before insert on public.calls for each row execute function public.calls_contacto()';
  end if;
end $$;
