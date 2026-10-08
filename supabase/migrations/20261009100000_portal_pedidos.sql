-- PORTAL DE CREADORAS · FASE 3: LOS PERSONALIZADOS (decisiones de Jhon, 06/10/2026).
-- Banco: supabase/tests/portal_pedidos.ts. La edge: portal-contenido (pedidos.ts).
--
-- La creadora ve sus pedidos apenas el chatter los crea («Por aprobar» mientras
-- esperan al supervisor) y, desde su portal:
--   · «Lo empiezo»        → en_produccion (solo si ya está aprobado);
--   · «Subir entrega»     → el archivo va a SU Drive (carpeta «Personalizados») y
--                           queda atado al pedido; el pedido pasa a listo. Si
--                           todavía estaba por aprobar, la entrega queda y espera:
--                           cuando el supervisor lo aprueba, pasa directo a listo;
--   · «No puedo hacerlo»  → estado NUEVO no_puede, con motivo obligatorio. Lo
--                           resuelve un supervisor (renegociar = vuelve a
--                           solicitado, denegar o reembolsar). Ella no deniega ni
--                           reembolsa.
-- Al entregar o al decir que no puede, avisa al chatter que lo vendió, al manager
-- de la creadora y a los supervisores que aprueban Personalizados (de su agencia).
-- A ella le avisa cuando le llega un pedido, cuando lo aprueban, cuando se cancela
-- y cuando ya le llegó al fan.
--
-- CÓMO ENTRA ELLA: no es de la agencia y no tiene rol, así que nada de esto pasa
-- por la RLS de custom_requests. La edge (service_role) comprueba la sesión y
-- llama a portal_pedido(), que vuelve a comprobar que el pedido es de su ficha
-- (creadora_cuentas) y que el archivo es de SU carpeta. Para que el historial
-- diga que fue ella (y no «nadie»: con service_role auth.uid() es null), la
-- función deja quién actúa en `maven.actor` y los triggers lo leen con
-- custom_request_actor().
--
-- Vuelta atrás (las líneas «--|»; el banco las corre):
--| drop trigger if exists custom_requests_avisa_a_la_creadora on public.custom_requests;
--| drop function if exists public.custom_requests_avisa_a_la_creadora();
--| drop function if exists public.portal_pedido(uuid, uuid, text, text, uuid);
--| drop function if exists public.portal_pedido_avisar_al_equipo(public.custom_requests, text, text);
--| create or replace function public.custom_requests_before_write() returns trigger language plpgsql security definer set search_path to 'public' as $f$
--| begin
--|   new.updated_at := now();
--|   new.updated_by := coalesce(auth.uid(), new.updated_by);
--|   if tg_op = 'INSERT' then
--|     new.created_by := coalesce(new.created_by, auth.uid());
--|     return new;
--|   end if;
--|   if new.status is distinct from old.status then
--|     if new.status in ('aprobado','denegado')
--|        and not (public.can_use_module_function(auth.uid(), 'Personalizados', 'Aprobar', 'supervisor_or_above')
--|                 and public.has_permission(auth.uid(), 'Personalizados')) then
--|       raise exception 'Solo un supervisor con el módulo Personalizados habilitado puede aprobar o denegar';
--|     end if;
--|     if new.status = 'aprobado' then
--|       new.approved_by := coalesce(auth.uid(), new.approved_by);
--|       new.approved_at := coalesce(new.approved_at, now());
--|     end if;
--|     if new.status = 'entregado' then
--|       new.delivered_at := coalesce(new.delivered_at, now());
--|     end if;
--|   end if;
--|   return new;
--| end;
--| $f$;
--| create or replace function public.custom_requests_log_status() returns trigger language plpgsql security definer set search_path to 'public' as $f$
--| begin
--|   if tg_op = 'INSERT' then
--|     insert into public.custom_request_events (request_id, actor_id, from_status, to_status)
--|     values (new.id, auth.uid(), null, new.status);
--|   elsif new.status is distinct from old.status then
--|     insert into public.custom_request_events (request_id, actor_id, from_status, to_status, note)
--|     values (new.id, auth.uid(), old.status, new.status,
--|             case when new.status = 'denegado' then new.denied_reason else null end);
--|   end if;
--|   return new;
--| end;
--| $f$;
--| drop function if exists public.custom_request_es_supervisor(uuid);
--| drop function if exists public.custom_request_actor();
--| delete from public.custom_request_attachments where storage_path is null;
--| alter table public.custom_request_attachments drop constraint if exists custom_request_attachments_origen;
--| alter table public.custom_request_attachments drop column if exists drive_item_id;
--| alter table public.custom_request_attachments alter column storage_path set not null;
--| update public.custom_requests set status = 'solicitado' where status = 'no_puede';
--| alter table public.custom_requests drop constraint if exists custom_requests_creadora_motivo_largo;
--| alter table public.custom_requests drop column if exists creadora_motivo;
--| alter table public.custom_requests drop constraint custom_requests_status_check;
--| alter table public.custom_requests add constraint custom_requests_status_check check (status = any (array['solicitado','aprobado','en_produccion','listo','entregado','denegado','reembolsado']));

-- ─── 1. El estado nuevo y el motivo de ella ─────────────────────────────────
alter table public.custom_requests drop constraint custom_requests_status_check;
alter table public.custom_requests add constraint custom_requests_status_check check (
  status = any (array['solicitado','aprobado','en_produccion','listo','entregado','denegado','reembolsado','no_puede'])
);
-- Por qué no puede: lo escribe ella (obligatorio) y lo lee quien lo resuelve.
alter table public.custom_requests add column creadora_motivo text;
alter table public.custom_requests add constraint custom_requests_creadora_motivo_largo
  check (creadora_motivo is null or char_length(creadora_motivo) <= 1000);

-- ─── 2. La entrega en su Drive ──────────────────────────────────────────────
-- Un adjunto es un archivo del bucket (lo que sube el equipo) O un archivo de su
-- Drive (lo que entrega ella): uno de los dos, nunca los dos. Si el archivo se
-- borra del Drive para siempre (papelera vaciada), el adjunto se va con él.
alter table public.custom_request_attachments
  add column drive_item_id uuid references public.drive_items (id) on delete cascade;
alter table public.custom_request_attachments alter column storage_path drop not null;
alter table public.custom_request_attachments add constraint custom_request_attachments_origen
  check ((storage_path is null) <> (drive_item_id is null));
-- ⚠️ La política de inserción del equipo (cra_insert) exige que storage_path
-- empiece con el id del pedido: con storage_path null no pasa. Los adjuntos del
-- Drive los escribe SOLO portal_pedido().

-- ─── 3. Quién actúa ─────────────────────────────────────────────────────────
-- La sesión (el equipo) o, si no hay, quien dejó portal_pedido() en maven.actor
-- (ella, por la edge con service_role).
create function public.custom_request_actor()
returns uuid
language sql
stable
set search_path to 'public'
as $$
  select coalesce(auth.uid(), nullif(current_setting('maven.actor', true), '')::uuid)
$$;

create function public.custom_request_es_supervisor(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_user is not null
     and public.can_use_module_function(p_user, 'Personalizados', 'Aprobar', 'supervisor_or_above')
     and public.has_permission(p_user, 'Personalizados')
$$;
revoke all on function public.custom_request_es_supervisor(uuid) from public, anon;

create or replace function public.custom_requests_before_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor uuid := public.custom_request_actor();
  desde_su_portal boolean := current_setting('maven.portal_pedido', true) = 'si';
begin
  new.updated_at := now();
  new.updated_by := coalesce(actor, new.updated_by);
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, actor);
    if new.status = 'no_puede' then
      raise exception 'Un pedido no nace en «La creadora no puede»';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    -- «La creadora no puede»: solo lo dice ella, desde su portal.
    if new.status = 'no_puede' and not desde_su_portal then
      raise exception 'Solo la creadora, desde su portal, dice que no puede hacer un pedido';
    end if;
    -- Lo que ella no puede hacer lo resuelve un supervisor: renegociar (vuelve a
    -- solicitado), denegar o reembolsar.
    if old.status = 'no_puede' then
      if not public.custom_request_es_supervisor(auth.uid()) then
        raise exception 'Solo un supervisor con el módulo Personalizados habilitado resuelve un pedido que la creadora no puede hacer';
      end if;
      if new.status not in ('solicitado', 'denegado', 'reembolsado') then
        raise exception 'Un pedido que la creadora no puede hacer se renegocia (vuelve a solicitado), se deniega o se reembolsa';
      end if;
    end if;
    if new.status in ('aprobado','denegado') and not public.custom_request_es_supervisor(auth.uid()) then
      raise exception 'Solo un supervisor con el módulo Personalizados habilitado puede aprobar o denegar';
    end if;
    if new.status = 'aprobado' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
      new.approved_at := coalesce(new.approved_at, now());
      -- Ella subió la entrega mientras esperaba la aprobación: aprobado = listo.
      if old.status = 'solicitado' and exists (
        select 1 from public.custom_request_attachments a
         where a.request_id = new.id and a.kind = 'entrega' and a.drive_item_id is not null
      ) then
        new.status := 'listo';
      end if;
    end if;
    if new.status = 'entregado' then
      new.delivered_at := coalesce(new.delivered_at, now());
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.custom_requests_log_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  actor uuid := public.custom_request_actor();
begin
  if tg_op = 'INSERT' then
    insert into public.custom_request_events (request_id, actor_id, from_status, to_status)
    values (new.id, actor, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.custom_request_events (request_id, actor_id, from_status, to_status, note)
    values (new.id, actor, old.status, new.status,
            case when new.status = 'denegado' then new.denied_reason
                 when new.status = 'no_puede' then new.creadora_motivo
                 else null end);
  end if;
  return new;
end;
$$;

-- ─── 4. Los avisos al equipo (entrega o «no puede») ─────────────────────────
-- Al chatter que lo vendió, al manager de la creadora y a los supervisores que
-- aprueban Personalizados en SU agencia. Una vez por persona, nunca a quien actúa.
create function public.portal_pedido_avisar_al_equipo(r public.custom_requests, p_tipo text, p_detalle text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  c public.creators;
  quien text;
  destinos uuid[];
  n integer := 0;
begin
  select * into c from public.creators where id = r.creator_id;
  quien := coalesce(nullif(btrim(c.artistic_name), ''), nullif(btrim(c.name), ''), r.creator_name, 'La creadora');
  select coalesce(array_agg(distinct u), '{}') into destinos from (
    select r.chatter_id as u
    union all select c.assigned_manager_profile_id
    union all
    select tm.user_id from public.tenant_members tm
     where tm.tenant_id = c.tenant_id and public.custom_request_es_supervisor(tm.user_id)
  ) x
  where u is not null and u is distinct from public.custom_request_actor();

  insert into public.notifications (
    user_id, type, title, message, reference_id, reference_type,
    module_origin, priority, status, deep_link_url, required_permission_module
  )
  select u, p_tipo,
    case p_tipo
      when 'personalizado_entrega' then quien || ' subió la entrega de un personalizado'
      else quien || ' no puede hacer un personalizado'
    end,
    left('Para ' || r.fan_handle || ': ' || p_detalle, 300),
    r.id, 'custom_request', 'Personalizados',
    case p_tipo when 'personalizado_entrega' then 'medium' else 'high' end,
    'new', '/personalizados?pedido=' || r.id, 'Personalizados'
  from unnest(destinos) u;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.portal_pedido_avisar_al_equipo(public.custom_requests, text, text) from public, anon, authenticated;

-- ─── 5. Lo que ella hace desde su portal ────────────────────────────────────
-- La llama la edge portal-contenido (service_role) DESPUÉS de comprobar la
-- sesión; esto vuelve a comprobar que el pedido es de su ficha. Devuelve
-- {ok, estado} o {error}.
create function public.portal_pedido(p_user uuid, p_request uuid, p_accion text, p_motivo text default null, p_item uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.custom_requests;
  raiz uuid;
  it public.drive_items;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  primera boolean;
  nuevo text;
begin
  select * into r from public.custom_requests where id = p_request for update;
  if r.id is null then return jsonb_build_object('error', 'no_existe'); end if;
  if r.creator_id is null or not exists (
    select 1 from public.creadora_cuentas cc where cc.user_id = p_user and cc.creator_id = r.creator_id
  ) then
    return jsonb_build_object('error', 'no_es_tuyo');
  end if;
  perform set_config('maven.actor', p_user::text, true);
  perform set_config('maven.portal_pedido', 'si', true);

  if p_accion = 'empezar' then
    if r.status <> 'aprobado' then
      return jsonb_build_object('error', case when r.status = 'solicitado' then 'por_aprobar' else 'no_se_puede' end, 'estado', r.status);
    end if;
    update public.custom_requests set status = 'en_produccion' where id = r.id;
    return jsonb_build_object('ok', true, 'estado', 'en_produccion');
  end if;

  if p_accion = 'no_puede' then
    if r.status not in ('solicitado', 'aprobado', 'en_produccion') then
      return jsonb_build_object('error', 'no_se_puede', 'estado', r.status);
    end if;
    if motivo is null or char_length(motivo) < 5 then
      return jsonb_build_object('error', 'falta_motivo');
    end if;
    update public.custom_requests set status = 'no_puede', creadora_motivo = left(motivo, 1000)
     where id = r.id returning * into r;
    perform public.portal_pedido_avisar_al_equipo(r, 'personalizado_no_puede', r.creadora_motivo);
    return jsonb_build_object('ok', true, 'estado', 'no_puede');
  end if;

  if p_accion = 'entregar' then
    if r.status not in ('solicitado', 'aprobado', 'en_produccion', 'listo') then
      return jsonb_build_object('error', 'no_se_puede', 'estado', r.status);
    end if;
    -- El archivo tiene que ser de SU carpeta, terminado de subir y no borrado.
    select item_id into raiz from public.creadora_carpetas where creator_id = r.creator_id;
    select * into it from public.drive_items where id = p_item;
    if raiz is null or it.id is null or it.tipo <> 'archivo' or it.estado <> 'listo'
       or it.trashed_at is not null or it.unidad_id is distinct from raiz then
      return jsonb_build_object('error', 'archivo_invalido');
    end if;
    if exists (select 1 from public.custom_request_attachments where request_id = r.id and drive_item_id = it.id) then
      return jsonb_build_object('ok', true, 'estado', r.status, 'ya_estaba', true);
    end if;
    primera := not exists (
      select 1 from public.custom_request_attachments where request_id = r.id and kind = 'entrega' and drive_item_id is not null
    );
    insert into public.custom_request_attachments (request_id, storage_path, drive_item_id, file_name, mime_type, size_bytes, kind, created_by)
    values (r.id, null, it.id, it.nombre, it.mime, it.size, 'entrega', p_user);
    nuevo := r.status;
    -- Por aprobar: la entrega queda y el pedido sigue esperando al supervisor.
    if r.status in ('aprobado', 'en_produccion') then
      update public.custom_requests set status = 'listo' where id = r.id;
      nuevo := 'listo';
    end if;
    if primera then
      perform public.portal_pedido_avisar_al_equipo(r, 'personalizado_entrega', left(r.description, 160));
    end if;
    return jsonb_build_object('ok', true, 'estado', nuevo);
  end if;

  return jsonb_build_object('error', 'accion_desconocida');
end;
$$;
revoke all on function public.portal_pedido(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.portal_pedido(uuid, uuid, text, text, uuid) to service_role;

-- ─── 6. Los avisos a ella ───────────────────────────────────────────────────
-- A su campana del portal (sin módulo: no tiene permisos de Maven y el aviso se
-- escondería). Le llega un pedido, se lo aprueban, se cancela, le llegó al fan,
-- o se lo vuelven a mandar después de renegociarlo.
create function public.custom_requests_avisa_a_la_creadora()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  titulo text;
  prioridad text := 'medium';
begin
  if new.creator_id is null then return new; end if;
  if tg_op = 'INSERT' then
    titulo := 'Te llegó un pedido personalizado';
    prioridad := 'high';
  elsif new.status is distinct from old.status then
    titulo := case
      when new.status = 'aprobado' then 'Aprobaron tu pedido: ya puedes hacerlo'
      when new.status = 'listo' and old.status = 'solicitado' then 'Aprobaron un pedido que ya entregaste'
      when new.status = 'solicitado' and old.status = 'no_puede' then 'Te volvieron a mandar un pedido'
      when new.status in ('denegado', 'reembolsado') then 'Se canceló un pedido'
      when new.status = 'entregado' then 'Tu personalizado ya le llegó al fan'
      else null
    end;
    if new.status in ('aprobado') or (new.status = 'solicitado' and old.status = 'no_puede') then prioridad := 'high'; end if;
  end if;
  if titulo is null then return new; end if;

  insert into public.notifications (
    user_id, type, title, message, reference_id, reference_type,
    module_origin, priority, status, deep_link_url, required_permission_module
  )
  select cc.user_id, 'portal_pedido', titulo,
    left('Para ' || new.fan_handle || ': ' || new.description, 300),
    new.id, 'custom_request', 'Portal', prioridad, 'new',
    '/portal/pedidos?p=' || new.id, null
  from public.creadora_cuentas cc
  where cc.creator_id = new.creator_id
    -- No se avisa a sí misma de lo que acaba de hacer.
    and cc.user_id is distinct from public.custom_request_actor();
  return new;
end;
$$;
revoke all on function public.custom_requests_avisa_a_la_creadora() from public, anon, authenticated;

create trigger custom_requests_avisa_a_la_creadora
  after insert or update of status on public.custom_requests
  for each row execute function public.custom_requests_avisa_a_la_creadora();
