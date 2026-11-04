-- ACTIVIDAD del Drive (estilo Google Drive · Alvaro 04/11): un registro
-- automático de quién hizo qué y cuándo (subió, creó carpeta, renombró, movió,
-- a papelera, restauró, borró), para la pestaña "Actividad" del panel lateral.
-- Vive 100% en Postgres, así que funciona aunque el NAS esté caído.

create table if not exists public.drive_actividad (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  -- El item: ON DELETE SET NULL para que el borrado definitivo no pierda el evento.
  item_id    uuid references public.drive_items(id) on delete set null,
  actor_id   uuid,                 -- quién lo hizo (sin FK: el log no debe poder romper una operación)
  accion     text not null check (accion in ('subio','creo_carpeta','renombro','movio','a_papelera','restauro','borro')),
  nombre     text,                 -- nombre del item en ese momento (sobrevive al borrado)
  parent_id  uuid,                 -- carpeta contenedora/destino, para agrupar por carpeta
  detalle    jsonb,                -- {antes,despues} de renombrar / {de,a} de mover
  created_at timestamptz not null default now()
);

create index if not exists drive_actividad_item_idx    on public.drive_actividad (item_id, created_at desc);
create index if not exists drive_actividad_carpeta_idx on public.drive_actividad (parent_id, created_at desc);
create index if not exists drive_actividad_actor_idx   on public.drive_actividad (tenant_id, actor_id, created_at desc);

-- Un único punto que captura TODOS los caminos (mover/renombrar/papelera/crear
-- son UPDATE/INSERT directos del navegador; subir/borrar son de la edge con
-- service_role): un trigger AFTER en drive_items.
create or replace function public.drive_registrar_actividad()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_accion  text;
  v_item    uuid;
  v_nombre  text;
  v_parent  uuid;
  v_tenant  uuid;
  v_actor   uuid;
  v_detalle jsonb := null;
begin
  -- El registro de actividad NUNCA puede tumbar una operación del Drive: todo va
  -- envuelto y cualquier error se traga (log best-effort).
  begin
    if tg_op = 'INSERT' then
      if new.tipo = 'carpeta' then
        v_accion := 'creo_carpeta';
      else
        return new;  -- archivo recién iniciado (estado 'subiendo'): aún no es un archivo real
      end if;
      v_item := new.id; v_nombre := new.nombre; v_parent := new.parent_id; v_tenant := new.tenant_id;

    elsif tg_op = 'UPDATE' then
      if new.estado = 'listo' and coalesce(old.estado,'') <> 'listo' and new.tipo = 'archivo' then
        v_accion := 'subio';  -- el momento real de "subió"
      elsif (old.trashed_at is null) and (new.trashed_at is not null) then
        v_accion := 'a_papelera';
      elsif (old.trashed_at is not null) and (new.trashed_at is null) then
        v_accion := 'restauro';
      elsif new.parent_id is distinct from old.parent_id then
        v_accion := 'movio';
        v_detalle := jsonb_build_object('de', old.parent_id, 'a', new.parent_id);
      elsif new.nombre is distinct from old.nombre then
        v_accion := 'renombro';
        v_detalle := jsonb_build_object('antes', old.nombre, 'despues', new.nombre);
      else
        return new;  -- cambio irrelevante (updated_at, size, sha256, last_opened_at…)
      end if;
      v_item := new.id; v_nombre := new.nombre; v_parent := new.parent_id; v_tenant := new.tenant_id;

    elsif tg_op = 'DELETE' then
      v_accion := 'borro';
      v_item := old.id; v_nombre := old.nombre; v_parent := old.parent_id; v_tenant := old.tenant_id;

    else
      return null;
    end if;

    -- Quién: el usuario del request; si corre con service_role (edge: subir/borrar),
    -- auth.uid() es null y se cae al dueño del item.
    v_actor := coalesce(auth.uid(), case when tg_op = 'DELETE' then old.owner_id else new.owner_id end);

    insert into public.drive_actividad (tenant_id, item_id, actor_id, accion, nombre, parent_id, detalle)
    values (
      v_tenant,
      case when tg_op = 'DELETE' then null else v_item end,  -- en DELETE la fila ya no existe (el FK la rechazaría)
      v_actor, v_accion, v_nombre, v_parent, v_detalle
    );
  exception when others then
    null;  -- best-effort: jamás romper la operación del Drive
  end;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists drive_actividad_log on public.drive_items;
create trigger drive_actividad_log
  after insert or update or delete on public.drive_items
  for each row execute function public.drive_registrar_actividad();

-- RLS: ver la actividad de tu agencia, de lo tuyo o de lo que puedes ver (por
-- rol en el item o en su carpeta). Escribe SOLO el trigger (security definer).
alter table public.drive_actividad enable row level security;

create policy "ver actividad del drive" on public.drive_actividad
  for select to authenticated
  using (
    tenant_id = (select public.current_tenant_id())
    and (
      actor_id = (select auth.uid())
      or public.drive_mi_rol(item_id) is not null
      or public.drive_mi_rol(parent_id) is not null
    )
  );

revoke insert, update, delete on public.drive_actividad from authenticated, anon;
grant select on public.drive_actividad to authenticated;
