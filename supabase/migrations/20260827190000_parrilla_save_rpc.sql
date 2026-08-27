-- PARRILLA — Ola 1 de pulido (tras testeo en vivo).
--
-- 1) parrilla_derive_tasks: la derivación de tareas esperadas pasa a SQL como
--    FUENTE ÚNICA (antes vivía duplicada en useParrilla.ts::deriveTasks y en el
--    seed; el cron de F2 la reutilizará tal cual).
-- 2) parrilla_save_grid: guardado TRANSACCIONAL (grid + días + tareas en una
--    sola llamada; antes eran 4 requests y un fallo a mitad dejaba la semana
--    sin tareas) con detección de edición concurrente vía updated_at esperado
--    (dos managers con la misma parrilla abierta ya no se pisan en silencio).

create or replace function public.parrilla_derive_tasks(p_grid_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager') then
    raise exception 'Sin permiso para editar la parrilla';
  end if;

  delete from content_grid_tasks where grid_id = p_grid_id;

  -- Publicación diaria de IG (cabecera del día: flyer/foto o video corto).
  insert into content_grid_tasks (grid_id, day_date, network, task_type, qty, franja, verificable, detalle)
  select d.grid_id, d.date, 'instagram',
         case when d.format_badge = 'video_corto' then 'reel' else 'publicacion' end,
         1, nullif(d.franja, ''), true, nullif(left(d.idea, 200), '')
  from content_grid_days d
  where d.grid_id = p_grid_id;

  -- Acción extra según tipo ('custom' no genera tarea: puede ser interna).
  insert into content_grid_tasks (grid_id, day_date, network, task_type, qty, franja, verificable, detalle)
  select d.grid_id, d.date, 'instagram', 'reel', 1, null, true,
         'Reel del día (referencias en la parrilla)'
  from content_grid_days d
  where d.grid_id = p_grid_id and d.extra_type = 'reel';

  insert into content_grid_tasks (grid_id, day_date, network, task_type, qty, franja, verificable, detalle)
  select d.grid_id, d.date, 'telegram', 'tg_publicacion',
         least(greatest(coalesce(jsonb_array_length(d.extra_items), 0), 3), 10),
         null, true, coalesce(nullif(d.extra_title, ''), 'Publicaciones del día en Telegram')
  from content_grid_days d
  where d.grid_id = p_grid_id and d.extra_type = 'tg_3pub';

  insert into content_grid_tasks (grid_id, day_date, network, task_type, qty, franja, verificable, detalle)
  select d.grid_id, d.date, 'telegram', 'tg_audio', 1, null, true, 'Audio de buenos días (15-30s)'
  from content_grid_days d
  where d.grid_id = p_grid_id and d.extra_type = 'tg_audio';

  insert into content_grid_tasks (grid_id, day_date, network, task_type, qty, franja, verificable, detalle)
  select d.grid_id, d.date, n.network, 'urgencia', 1, null, true, nullif(d.extra_title, '')
  from content_grid_days d
  cross join (values ('x'), ('telegram')) as n(network)
  where d.grid_id = p_grid_id and d.extra_type in ('dinamica_lanzamiento', 'dinamica_cierre');
end;
$$;

create or replace function public.parrilla_save_grid(
  p_grid_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_status text,
  p_theme jsonb,
  p_feedback text,
  p_days jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated timestamptz;
  d jsonb;
begin
  if not can_use_module_function(v_uid, 'Parrilla', 'Editar', 'manager') then
    raise exception 'Sin permiso para editar la parrilla';
  end if;

  update content_grids
     set title = coalesce(p_title, title),
         status = coalesce(p_status, status),
         theme = coalesce(p_theme, theme),
         feedback = nullif(p_feedback, ''),
         feedback_by = case when nullif(p_feedback, '') is not null then v_uid else feedback_by end,
         feedback_at = case when nullif(p_feedback, '') is not null then now() else feedback_at end,
         updated_at = now(),
         updated_by = v_uid
   where id = p_grid_id
     and (p_expected_updated_at is null or updated_at = p_expected_updated_at)
  returning updated_at into v_updated;

  if v_updated is null then
    if exists (select 1 from content_grids where id = p_grid_id) then
      raise exception 'conflict: otra persona guardó esta parrilla';
    end if;
    raise exception 'Parrilla no encontrada';
  end if;

  for d in select * from jsonb_array_elements(coalesce(p_days, '[]'::jsonb)) loop
    insert into content_grid_days (grid_id, day_index, date, format_badge, idea, copy_sugerido,
                                   franja, extra_type, extra_title, extra_desc, extra_items, refs)
    values (
      p_grid_id,
      (d->>'day_index')::int,
      (d->>'date')::date,
      coalesce(d->>'format_badge', 'flyer_foto'),
      coalesce(d->>'idea', ''),
      coalesce(d->>'copy_sugerido', ''),
      coalesce(d->>'franja', ''),
      coalesce(d->>'extra_type', 'custom'),
      coalesce(d->>'extra_title', ''),
      coalesce(d->>'extra_desc', ''),
      coalesce(d->'extra_items', '[]'::jsonb),
      coalesce(d->'refs', '[]'::jsonb)
    )
    on conflict (grid_id, day_index) do update
      set date = excluded.date,
          format_badge = excluded.format_badge,
          idea = excluded.idea,
          copy_sugerido = excluded.copy_sugerido,
          franja = excluded.franja,
          extra_type = excluded.extra_type,
          extra_title = excluded.extra_title,
          extra_desc = excluded.extra_desc,
          extra_items = excluded.extra_items,
          refs = excluded.refs;
  end loop;

  perform parrilla_derive_tasks(p_grid_id);

  return jsonb_build_object('updated_at', v_updated);
end;
$$;

revoke execute on function public.parrilla_derive_tasks(uuid) from anon;
revoke execute on function public.parrilla_save_grid(uuid, timestamptz, text, text, jsonb, text, jsonb) from anon;

notify pgrst, 'reload schema';
