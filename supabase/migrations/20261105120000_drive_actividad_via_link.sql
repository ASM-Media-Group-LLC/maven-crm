-- Actividad del Drive · corrección "subido por link" (Alvaro, 05/11)
-- Antes: cuando un archivo entraba por el LINK PÚBLICO, el cron lo pasa a "listo"
-- con service_role (auth.uid() = null), así que el trigger caía al dueño de la
-- carpeta y la Actividad decía, por ejemplo, "Maria Villegas subió" aunque Maria
-- solo creó la carpeta. Ahora: si el item proviene de un aporte por link
-- (drive_aportes.nas_item_id = item.id), NO se atribuye a nadie interno; se
-- guarda en `detalle` que vino por link y el nombre real de quien subió (`quien`).

-- Lookup rápido del origen (nas_item_id / drive_item_id) para el trigger.
create index if not exists drive_aportes_nas_item_idx on public.drive_aportes (nas_item_id);
create index if not exists drive_aportes_item_idx     on public.drive_aportes (drive_item_id);

create or replace function public.drive_registrar_actividad()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_accion   text;
  v_item     uuid;
  v_nombre   text;
  v_parent   uuid;
  v_tenant   uuid;
  v_actor    uuid;
  v_detalle  jsonb := null;
  v_via_link boolean := false;
  v_quien    text := null;
begin
  begin
    if tg_op = 'INSERT' then
      if new.tipo = 'carpeta' then
        v_accion := 'creo_carpeta';
      else
        return new;  -- archivo recién iniciado (estado 'subiendo'/'procesando'): aún no es real
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

    -- ¿Vino por el link público? Solo aplica a "subió": el cron pasa a "listo" un
    -- aporte cuyo nas_item_id/drive_item_id es este item. Si existe la fila, fue
    -- por link (aunque `quien` sea null = invitado sin nombre).
    if v_accion = 'subio' then
      select a.quien into v_quien
      from public.drive_aportes a
      where a.nas_item_id = v_item or a.drive_item_id = v_item
      limit 1;
      if found then v_via_link := true; end if;
    end if;

    if v_via_link then
      v_actor := null;  -- no es de nadie interno: lo subió un invitado por el link
      v_detalle := jsonb_build_object('via_link', true, 'quien', v_quien);
    else
      -- Quién: el usuario del request; con service_role (edge) auth.uid() es null
      -- y se cae al dueño del item.
      v_actor := coalesce(auth.uid(), case when tg_op = 'DELETE' then old.owner_id else new.owner_id end);
    end if;

    insert into public.drive_actividad (tenant_id, item_id, actor_id, accion, nombre, parent_id, detalle)
    values (
      v_tenant,
      case when tg_op = 'DELETE' then null else v_item end,
      v_actor, v_accion, v_nombre, v_parent, v_detalle
    );
  exception when others then
    null;  -- best-effort: jamás romper la operación del Drive
  end;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Backfill: arregla los "subió" ya registrados que en realidad vinieron por link
-- (los atribuía al dueño de la carpeta). Les quita el actor y guarda el `quien`.
update public.drive_actividad act
set actor_id = null,
    detalle  = jsonb_build_object('via_link', true, 'quien', a.quien)
from public.drive_aportes a
where act.accion = 'subio'
  and (a.nas_item_id = act.item_id or a.drive_item_id = act.item_id)
  and (act.detalle is null or (act.detalle ->> 'via_link') is distinct from 'true');
