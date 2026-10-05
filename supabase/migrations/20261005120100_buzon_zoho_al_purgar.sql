-- El buzón de Zoho de una cuenta dada de baja se borra AL PURGARLA (a los 30
-- días), no al suspenderla. Decisión de Jhon, 05/10/2026.
--
-- Hasta hoy, «eliminar» suspendía la cuenta (30 días recuperable) pero
-- borraba el buzón de Zoho en el acto, y eso no se deshace: recuperar a
-- alguien le devolvía la cuenta sin su correo. Ahora el buzón se conserva
-- mientras la cuenta está en la papelera y se borra cuando la cuenta se purga.
--
-- El problema: la purga automática es SQL (este cron) y no puede hablar con
-- Zoho. Y después de purgar ya no se sabe cuál era el buzón, porque
-- app_purge_user_refs se lleva mail_credentials. Por eso:
--
--   1. buzones_por_borrar: una cola. La purga (la automática de aquí y la
--      manual de admin-user-actions) anota el buzón ANTES de destruir nada.
--   2. app_casilla_de_la_cuenta: la regla de cuál es el buzón de una cuenta,
--      UNA sola vez, para la edge y para el cron.
--   3. app_purgar_cuentas_vencidas: igual que antes, más el paso 1.
--   4. El cron borrar-buzones-vencidos despierta a la edge buzones-por-borrar
--      (07:20 UTC, 20 min después de la purga, y solo si hay algo vencido),
--      que vuelve a comprobar todo y borra en Zoho.
--
-- Nadie tiene que acordarse de nada: lo que la edge no pueda hoy (Zoho caído)
-- queda pendiente y se reintenta al día siguiente, hasta 10 veces.
--
-- ORDEN: aplicar ANTES de mergear el PR. Las edges nuevas cuentan con estas
-- funciones; sin ellas la purga manual se niega a purgar (no destruye nada) y
-- la baja funciona igual pero sin decir qué buzón conserva.

-- 0. Guarda: la función que se reemplaza tiene que ser la que conocemos. Dos
-- huellas: la de prod (aplicada sin comentarios) y la del repo
-- (20260907200000_purga_cuentas_vencidas.sql, con comentarios).
do $$
begin
  if coalesce(
       (select md5(prosrc) from pg_proc
         where proname = 'app_purgar_cuentas_vencidas' and pronamespace = 'public'::regnamespace),
       'no existe')
     not in ('b54343e20393b75508d739fd3459c9fc', 'caeb79d358839a358378683bfd9a5586') then
    raise exception 'app_purgar_cuentas_vencidas cambió en la base: revisar antes de reemplazarla';
  end if;
end $$;

-- 1. La cola. A propósito SIN FK a auth.users ni a profiles: la fila tiene que
-- sobrevivir a la purga, que es justo cuando se usa.
create table if not exists public.buzones_por_borrar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  direccion text not null,
  -- profiles.deleted_at cuando se encoló, y desde cuándo se puede borrar.
  eliminada_el timestamptz not null,
  borrar_desde timestamptz not null,
  origen text not null check (origen in ('purga_manual', 'purga_automatica')),
  -- El evento 'purgada' de cuenta_eventos que se completa con el resultado.
  evento_id uuid,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'borrado', 'no_se_borra', 'fallido')),
  -- Por qué está como está. Toda salida deja uno (salvo 'borrado').
  motivo text,
  intentos int not null default 0,
  ultimo_intento_el timestamptz,
  resuelto_el timestamptz,
  creado_el timestamptz not null default now(),
  constraint buzones_por_borrar_una_por_cuenta unique (user_id, direccion)
);

comment on table public.buzones_por_borrar is
  'Buzones de Zoho de cuentas purgadas, por borrar. La llenan las purgas (antes de '
  'destruir la cuenta) y la vacía la edge buzones-por-borrar. Ver 20261005120100.';

create index if not exists buzones_por_borrar_pendientes_idx
  on public.buzones_por_borrar (borrar_desde) where estado = 'pendiente';

alter table public.buzones_por_borrar enable row level security;

-- Solo lectura, y solo para quien puede gestionar usuarios (como cuenta_eventos).
-- Escriben la edge y el cron con service_role / SECURITY DEFINER.
drop policy if exists "Gestores de usuarios leen la cola de buzones" on public.buzones_por_borrar;
create policy "Gestores de usuarios leen la cola de buzones"
  on public.buzones_por_borrar for select
  to authenticated
  using (public.can_manage_users((select auth.uid())));

revoke insert, update, delete, truncate on public.buzones_por_borrar from anon, authenticated;

-- 2. Cuál es el buzón de una cuenta.
--   · La credencial vigente, o la que se revocó CON la baja (el trigger
--     profiles_baja_revoca_correo la revoca en el mismo update que marca
--     deleted_at; 10 minutos de margen por el reloj de la edge). Una credencial
--     revocada antes es una casilla vieja de un cambio de correo: ésa no se
--     toca nunca («Su casilla anterior no se toca»).
--   · Si no hay credencial, el correo de acceso, pero SOLO si es del dominio
--     del equipo: ahí la identidad ES la casilla (el caso de brenda). Un acceso
--     @unlok.me o @gmail no es un buzón de Maven y no se borra por esto.
create or replace function public.app_casilla_de_la_cuenta(
  p_user_id uuid,
  p_dominio text default 'maven-ai.me'
)
returns text
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(
    (select c.email_address
       from public.mail_credentials c
       left join public.profiles p on p.id = c.user_id
      where c.user_id = p_user_id
        and (c.revoked_at is null
             or (p.deleted_at is not null and c.revoked_at >= p.deleted_at - interval '10 minutes'))
      order by (c.revoked_at is null) desc, c.revoked_at desc, c.created_at desc
      limit 1),
    (select u.email
       from auth.users u
      where u.id = p_user_id
        and nullif(btrim(p_dominio), '') is not null
        and lower(split_part(u.email, '@', 2)) = lower(btrim(p_dominio)))
  );
$$;

-- 3. Anotar un buzón en la cola. Idempotente: si ya estaba (una purga manual
-- que falló y después la tomó el cron), se reabre con los datos nuevos, salvo
-- que ya se haya borrado.
create or replace function public.app_encolar_buzon(
  p_user_id uuid,
  p_direccion text,
  p_eliminada_el timestamptz,
  p_dias int,
  p_origen text,
  p_evento_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dir text := nullif(btrim(p_direccion), '');
  v_id uuid;
begin
  if v_dir is null then
    return null;
  end if;
  if p_dias is null or p_dias < 1 then
    raise exception 'p_dias tiene que ser al menos 1 (llegó %)', p_dias;
  end if;
  if p_eliminada_el is null then
    raise exception 'falta la fecha de baja de %', p_user_id;
  end if;

  insert into public.buzones_por_borrar as b
    (user_id, direccion, eliminada_el, borrar_desde, origen, evento_id)
  values
    (p_user_id, v_dir, p_eliminada_el, p_eliminada_el + make_interval(days => p_dias), p_origen, p_evento_id)
  on conflict (user_id, direccion) do update
    set eliminada_el = excluded.eliminada_el,
        borrar_desde = excluded.borrar_desde,
        origen = excluded.origen,
        evento_id = excluded.evento_id,
        estado = 'pendiente',
        motivo = null,
        intentos = 0,
        ultimo_intento_el = null,
        resuelto_el = null
    where b.estado <> 'borrado'
  returning b.id into v_id;

  if v_id is null then
    -- Ya estaba borrado: se devuelve esa fila, que la edge no vuelve a procesar.
    select b.id into v_id from public.buzones_por_borrar b
     where b.user_id = p_user_id and b.direccion = v_dir;
  end if;
  return v_id;
end;
$$;

-- 4. Lo que la edge necesita saber justo antes de borrar. Se lee en el
-- momento, no al encolar: entre una cosa y la otra pueden pasar días.
create or replace function public.app_buzon_por_borrar_contexto(p_user_id uuid, p_direccion text)
returns jsonb
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select jsonb_build_object(
    -- false = la cuenta ya se purgó: no se puede recuperar.
    'perfil_existe', exists (select 1 from public.profiles p where p.id = p_user_id),
    -- null con el perfil vivo = la recuperaron.
    'deleted_at', (select p.deleted_at from public.profiles p where p.id = p_user_id),
    -- La dirección se reusó: otra cuenta entra con ella o la tiene vinculada.
    'otra_cuenta_con_esa_direccion', exists (
      select 1 from auth.users u
       where lower(u.email) = lower(btrim(p_direccion)) and u.id <> p_user_id),
    'credencial_activa_de_otra', exists (
      select 1 from public.mail_credentials c
       where lower(c.email_address) = lower(btrim(p_direccion))
         and c.user_id <> p_user_id
         and c.revoked_at is null)
  );
$$;

-- 5. El resultado: en la cola y en el evento 'purgada' de cuenta_eventos, que
-- es donde se mira «¿qué pasó con el correo de esta persona?».
-- p_cuenta = false cuando no fue un intento fallido sino una espera (el plazo
-- de 30 días todavía no se cumple): no gasta intentos.
create or replace function public.app_buzon_por_borrar_resultado(
  p_id uuid,
  p_estado text,
  p_motivo text,
  p_cuenta boolean default true
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v public.buzones_por_borrar;
begin
  if p_estado is null or p_estado not in ('pendiente', 'borrado', 'no_se_borra', 'fallido') then
    raise exception 'estado inválido: %', p_estado;
  end if;

  update public.buzones_por_borrar
     set estado = p_estado,
         motivo = p_motivo,
         intentos = intentos + case when p_cuenta then 1 else 0 end,
         ultimo_intento_el = now(),
         resuelto_el = case when p_estado = 'pendiente' then null else now() end
   where id = p_id
  returning * into v;

  if not found then
    raise exception 'no existe la fila % de buzones_por_borrar', p_id;
  end if;

  if v.evento_id is not null then
    update public.cuenta_eventos
       set detalle = coalesce(detalle, '{}'::jsonb) || jsonb_build_object(
             'casilla_zoho', v.direccion,
             'casilla_zoho_estado', p_estado,
             'casilla_zoho_liberada', case when p_estado = 'borrado' then v.direccion end,
             'casilla_zoho_motivo', p_motivo,
             'casilla_zoho_intentos', v.intentos,
             'casilla_zoho_actualizado_el', now())
     where id = v.evento_id;
  end if;
end;
$$;

-- 6. La purga automática, igual que antes más el buzón: se averigua y se
-- encola ANTES de destruir, en la misma transacción (si algo falla, no queda
-- ni la purga ni la fila).
create or replace function public.app_purgar_cuentas_vencidas(
  p_dias int default 30,
  -- Tope por vuelta. No es por rendimiento: es para que un deleted_at mal
  -- puesto (o un p_dias en 0) no pueda vaciar la empresa en una sola corrida.
  -- Lo que sobre se purga en el pase siguiente.
  p_tope int default 50
)
returns int
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  r record;
  v_purgadas int := 0;
  v_casilla text;
  v_evento uuid;
begin
  if p_dias < 1 then
    raise exception 'p_dias tiene que ser al menos 1 (llegó %)', p_dias;
  end if;

  for r in
    select p.id, p.full_name, p.deleted_at, u.email
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.deleted_at is not null
      and p.deleted_at < now() - make_interval(days => p_dias)
    order by p.deleted_at
    limit p_tope
  loop
    -- El buzón, mientras mail_credentials todavía existe.
    v_casilla := public.app_casilla_de_la_cuenta(r.id);
    v_evento := gen_random_uuid();

    -- La constancia va ANTES de destruir: después no queda de dónde copiar el
    -- nombre ni el correo. actor_id NULL = lo hizo el cron, no una persona. La
    -- edge completa casilla_zoho_* cuando procesa la cola.
    insert into public.cuenta_eventos
      (id, user_id, user_email, user_full_name, accion, actor_id, actor_email, detalle)
    values
      (v_evento, r.id, r.email, r.full_name, 'purgada', null, 'cron',
       jsonb_build_object(
         'eliminada_el', r.deleted_at,
         'dias_de_papelera', p_dias,
         'casilla_zoho', v_casilla,
         'casilla_zoho_liberada', null,
         'casilla_zoho_estado', case when v_casilla is not null then 'pendiente' end,
         'casilla_zoho_motivo', case
           when v_casilla is null then 'la cuenta no tenía casilla de correo de Maven'
           else 'en cola: la borra la edge buzones-por-borrar'
         end));

    if v_casilla is not null then
      perform public.app_encolar_buzon(r.id, v_casilla, r.deleted_at, p_dias, 'purga_automatica', v_evento);
    end if;

    perform public.app_purge_user_refs(r.id);
    perform public.app_force_delete_auth_user(r.id);

    v_purgadas := v_purgadas + 1;
  end loop;

  return v_purgadas;
end;
$$;

-- Solo service_role (la edge) y el cron (postgres). Supabase le da EXECUTE a
-- anon y authenticated a toda función nueva: hay que sacárselo.
revoke all on function public.app_casilla_de_la_cuenta(uuid, text) from public, anon, authenticated;
revoke all on function public.app_encolar_buzon(uuid, text, timestamptz, int, text, uuid) from public, anon, authenticated;
revoke all on function public.app_buzon_por_borrar_contexto(uuid, text) from public, anon, authenticated;
revoke all on function public.app_buzon_por_borrar_resultado(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.app_purgar_cuentas_vencidas(int, int) from public, anon, authenticated;
grant execute on function public.app_casilla_de_la_cuenta(uuid, text) to service_role;
grant execute on function public.app_encolar_buzon(uuid, text, timestamptz, int, text, uuid) to service_role;
grant execute on function public.app_buzon_por_borrar_contexto(uuid, text) to service_role;
grant execute on function public.app_buzon_por_borrar_resultado(uuid, text, text, boolean) to service_role;
grant execute on function public.app_purgar_cuentas_vencidas(int, int) to service_role;

-- 7. El cron que despierta a la edge. 07:20 UTC: 20 minutos después de la
-- purga (07:00), así lo que ésta encola ese día se borra ese mismo día. Solo
-- llama si hay algo vencido; la lectura del vault está dentro del SELECT que
-- filtra ese WHERE, así que sin trabajo ni se lee.
select cron.unschedule('borrar-buzones-vencidos')
where exists (select 1 from cron.job where jobname = 'borrar-buzones-vencidos');

select cron.schedule(
  'borrar-buzones-vencidos',
  '20 7 * * *',
  $cron$
  select net.http_post(
    url := 'https://lsagslbkliprespbyhts.supabase.co/functions/v1/buzones-por-borrar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Token', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_internal_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000)
  where exists (
    select 1 from public.buzones_por_borrar
     where estado = 'pendiente' and borrar_desde <= now());
  $cron$
);

-- Vuelta atrás: la purga como en prod antes de esto, sin el cron ni la cola.
-- ⚠️ Con las edges de este PR desplegadas, volver atrás deja SIN borrar el
-- buzón de lo que purgue el cron (la baja ya no lo borra). Lo que quede en la
-- cola sin procesar se pierde con la tabla: mirarlo antes.
--| select cron.unschedule('borrar-buzones-vencidos')
--| where exists (select 1 from cron.job where jobname = 'borrar-buzones-vencidos');
--| create or replace function public.app_purgar_cuentas_vencidas(p_dias int default 30, p_tope int default 50)
--| returns int
--| language plpgsql
--| security definer
--| set search_path = public, auth, pg_temp
--| as $$
--| declare
--|   r record;
--|   v_purgadas int := 0;
--| begin
--|   if p_dias < 1 then
--|     raise exception 'p_dias tiene que ser al menos 1 (llegó %)', p_dias;
--|   end if;
--|
--|   for r in
--|     select p.id, p.full_name, p.deleted_at, u.email
--|     from public.profiles p
--|     left join auth.users u on u.id = p.id
--|     where p.deleted_at is not null
--|       and p.deleted_at < now() - make_interval(days => p_dias)
--|     order by p.deleted_at
--|     limit p_tope
--|   loop
--|     insert into public.cuenta_eventos
--|       (user_id, user_email, user_full_name, accion, actor_id, actor_email, detalle)
--|     values
--|       (r.id, r.email, r.full_name, 'purgada', null, 'cron',
--|        jsonb_build_object('eliminada_el', r.deleted_at, 'dias_de_papelera', p_dias));
--|
--|     perform public.app_purge_user_refs(r.id);
--|     perform public.app_force_delete_auth_user(r.id);
--|
--|     v_purgadas := v_purgadas + 1;
--|   end loop;
--|
--|   return v_purgadas;
--| end;
--| $$;
--| drop function if exists public.app_buzon_por_borrar_resultado(uuid, text, text, boolean);
--| drop function if exists public.app_buzon_por_borrar_contexto(uuid, text);
--| drop function if exists public.app_encolar_buzon(uuid, text, timestamptz, int, text, uuid);
--| drop function if exists public.app_casilla_de_la_cuenta(uuid, text);
--| drop table if exists public.buzones_por_borrar;
