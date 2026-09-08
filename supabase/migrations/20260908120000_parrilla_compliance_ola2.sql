-- PARRILLA — OLA 2: el CONTRATO del compliance en el schema (antes de F2/F4).
-- Aprobado por Jhon 08/09. Cambios:
--   1) Franja ESTRUCTURADA: content_grid_days.franja_start/franja_end (time) +
--      content_grid_tasks.franja_start/franja_end/tolerance_min. El texto `franja`
--      queda como display (se regenera desde las horas). El verificador de F4
--      matchea `posted_at between franja_start - tol and franja_end + tol` en
--      hora-pared Bogotá — sin heurísticas sobre texto libre.
--   2) IDENTIDAD ESTABLE de tareas: unique por clave natural
--      (grid_id, day_date, network, task_type) y parrilla_derive_tasks hace UPSERT
--      + borra solo las que dejaron de existir. Los resultados de F4 que apunten a
--      task_id sobreviven a un re-guardado de la parrilla.
--   3) Tareas INTERNAS materializadas: extra_type='custom' genera fila
--      task_type='interna', network null, verificable=false (antes el flag era
--      código muerto). Check: si verificable, red obligatoria.
--   4) verify_source por tarea: 'promolog' (IG/X vía promolog_entries) o
--      'telegram_scan' (posts/audios de TG: solo existencia, sin transcripción).
--   5) EXCEPCIONES por creadora: content_grid_exemptions (grid_id, creator_id,
--      day_date null = toda la semana, motivo) — enfermas, nuevas, sin TG,
--      variación pactada. F4 las excluye para no marcar incumplimientos falsos.
--   6) CONGELAR al enviar: con status='enviada' no se editan días ni tareas
--      (trigger). Para corregir: "Volver a borrador" y re-enviar.
--   7) unique (grid_id, date) en días + índice (day_date, network) en tareas.
--
-- REGLA DE DÍA (documentada para F4): day_date es DÍA BOGOTÁ. promolog_entries.date
-- es timestamp naive en UTC → comparar con la columna generada `dia` o con el
-- corte T05:00Z; para tareas de 'noche' aceptar hasta ~02:00 del día siguiente.

-- ── 1) Franja estructurada en días ────────────────────────────────────────────
alter table public.content_grid_days
  add column if not exists franja_start time,
  add column if not exists franja_end time;
comment on column public.content_grid_days.franja is 'Display; se regenera desde franja_start/franja_end al guardar';
comment on column public.content_grid_days.franja_start is 'Hora-pared Bogotá. Fuente para content_grid_tasks.franja_start';

-- backfill desde el texto "HH:MM - HH:MM"
update public.content_grid_days
set franja_start = (regexp_match(franja, '^\s*(\d{1,2}:\d{2})'))[1]::time,
    franja_end   = (regexp_match(franja, '-\s*(\d{1,2}:\d{2})\s*$'))[1]::time
where franja ~ '^\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*$'
  and (franja_start is null or franja_end is null);

create unique index if not exists uq_cgd_grid_date on public.content_grid_days (grid_id, date);

-- ── 2-4) Tareas: identidad estable, franja, fuente, internas ─────────────────
alter table public.content_grid_tasks
  add column if not exists franja_start time,
  add column if not exists franja_end time,
  add column if not exists tolerance_min integer not null default 120,
  add column if not exists verify_source text;
alter table public.content_grid_tasks alter column network drop not null;
alter table public.content_grid_tasks drop constraint if exists content_grid_tasks_network_check;
alter table public.content_grid_tasks
  add constraint content_grid_tasks_network_check
  check (network is null or network in ('instagram','x','telegram'));
alter table public.content_grid_tasks drop constraint if exists content_grid_tasks_task_type_check;
alter table public.content_grid_tasks
  add constraint content_grid_tasks_task_type_check
  check (task_type in ('publicacion','reel','tg_publicacion','tg_audio','urgencia','interna'));
alter table public.content_grid_tasks drop constraint if exists content_grid_tasks_interna_sin_red;
alter table public.content_grid_tasks
  add constraint content_grid_tasks_interna_sin_red
  check (verificable = false or network is not null);
alter table public.content_grid_tasks drop constraint if exists content_grid_tasks_verify_source_check;
alter table public.content_grid_tasks
  add constraint content_grid_tasks_verify_source_check
  check (verify_source is null or verify_source in ('promolog','telegram_scan'));
comment on column public.content_grid_tasks.day_date is 'DÍA BOGOTÁ. Cruzar con promolog_entries.dia (no con date::date, que es UTC)';
comment on column public.content_grid_tasks.tolerance_min is 'Minutos de tolerancia alrededor de la franja para dar por cumplida la publicación';
comment on column public.content_grid_tasks.verify_source is 'promolog = IG/X vía promolog_entries · telegram_scan = existencia de post/audio en TG';

-- Antes del índice: depurar duplicados históricos (días con cabecera 'video corto'
-- + extra 'reel del día' generaban DOS tareas instagram/reel idénticas; el modelo
-- nuevo las unifica).
delete from public.content_grid_tasks a
using public.content_grid_tasks b
where a.grid_id = b.grid_id and a.day_date = b.day_date
  and coalesce(a.network,'-') = coalesce(b.network,'-') and a.task_type = b.task_type
  and a.id > b.id;

-- clave natural (network nullable → coalesce en el índice; el upsert usa la misma expresión)
create unique index if not exists uq_cgt_natural
  on public.content_grid_tasks (grid_id, day_date, coalesce(network, '-'), task_type);
create index if not exists idx_cgt_date_network on public.content_grid_tasks (day_date, network);

-- ── 5) Excepciones por creadora ──────────────────────────────────────────────
create table if not exists public.content_grid_exemptions (
  id uuid primary key default gen_random_uuid(),
  grid_id uuid not null references public.content_grids(id) on delete cascade,
  creator_id uuid not null references public.creators(id) on delete cascade,
  day_date date,            -- null = toda la semana
  motivo text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_cge_grid on public.content_grid_exemptions (grid_id);
create index if not exists idx_cge_creator on public.content_grid_exemptions (creator_id);
alter table public.content_grid_exemptions enable row level security;
drop policy if exists cge_read on public.content_grid_exemptions;
create policy cge_read on public.content_grid_exemptions for select to authenticated using (true);
drop policy if exists cge_write on public.content_grid_exemptions;
create policy cge_write on public.content_grid_exemptions for all to authenticated
  using (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'))
  with check (public.can_use_module_function(auth.uid(), 'Parrilla', 'Editar', 'manager'));

-- ── 6) Congelar al enviar ────────────────────────────────────────────────────
create or replace function public.parrilla_guard_enviada()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_status text;
begin
  select status into v_status from content_grids where id = coalesce(new.grid_id, old.grid_id);
  if v_status = 'enviada' then
    raise exception 'La parrilla ya fue enviada al grupo: volvé a borrador para editarla'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_parrilla_guard_days on public.content_grid_days;
create trigger trg_parrilla_guard_days
  before insert or update or delete on public.content_grid_days
  for each row execute function public.parrilla_guard_enviada();
drop trigger if exists trg_parrilla_guard_tasks on public.content_grid_tasks;
create trigger trg_parrilla_guard_tasks
  before insert or update or delete on public.content_grid_tasks
  for each row execute function public.parrilla_guard_enviada();

-- ── Derivación: UPSERT por clave natural + tareas internas + fuente ───────────
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

  with nuevas as (
    -- Publicación diaria de IG (cabecera del día)
    select d.grid_id, d.date as day_date, 'instagram'::text as network,
           case when d.format_badge = 'video_corto' then 'reel' else 'publicacion' end as task_type,
           1 as qty, nullif(d.franja,'') as franja, d.franja_start, d.franja_end,
           true as verificable, nullif(left(d.idea,200),'') as detalle, 'promolog'::text as verify_source
    from content_grid_days d where d.grid_id = p_grid_id
    union all
    select d.grid_id, d.date, 'instagram', 'reel', 1, null, null, null, true,
           'Reel del día (referencias en la parrilla)', 'promolog'
    from content_grid_days d where d.grid_id = p_grid_id and d.extra_type = 'reel'
      and d.format_badge <> 'video_corto'   -- si la cabecera ya es reel, no duplicar la clave
    union all
    select d.grid_id, d.date, 'telegram', 'tg_publicacion',
           least(greatest(coalesce(jsonb_array_length(d.extra_items),0),3),10), null, null, null, true,
           coalesce(nullif(d.extra_title,''), 'Publicaciones del día en Telegram'), 'telegram_scan'
    from content_grid_days d where d.grid_id = p_grid_id and d.extra_type = 'tg_3pub'
    union all
    select d.grid_id, d.date, 'telegram', 'tg_audio', 1, null, null, null, true,
           'Audio de buenos días (existencia; sin transcripción)', 'telegram_scan'
    from content_grid_days d where d.grid_id = p_grid_id and d.extra_type = 'tg_audio'
    union all
    select d.grid_id, d.date, n.network, 'urgencia', 1, null, null, null, true, nullif(d.extra_title,''),
           case n.network when 'x' then 'promolog' else 'telegram_scan' end
    from content_grid_days d cross join (values ('x'),('telegram')) as n(network)
    where d.grid_id = p_grid_id and d.extra_type in ('dinamica_lanzamiento','dinamica_cierre')
    union all
    -- Acción interna (custom): existe como tarea pero NO se audita
    select d.grid_id, d.date, null, 'interna', 1, null, null, null, false,
           coalesce(nullif(d.extra_title,''), nullif(left(d.extra_desc,200),''), 'Acción interna'), null
    from content_grid_days d where d.grid_id = p_grid_id and d.extra_type = 'custom'
      and (nullif(d.extra_title,'') is not null or nullif(d.extra_desc,'') is not null)
  ),
  up as (
    insert into content_grid_tasks
      (grid_id, day_date, network, task_type, qty, franja, franja_start, franja_end, verificable, detalle, verify_source)
    select grid_id, day_date, network, task_type, qty, franja, franja_start, franja_end, verificable, detalle, verify_source
    from nuevas
    on conflict (grid_id, day_date, coalesce(network,'-'), task_type) do update
      set qty = excluded.qty, franja = excluded.franja,
          franja_start = excluded.franja_start, franja_end = excluded.franja_end,
          verificable = excluded.verificable, detalle = excluded.detalle,
          verify_source = excluded.verify_source
    returning id
  )
  delete from content_grid_tasks t
  where t.grid_id = p_grid_id and t.id not in (select id from up);
end;
$$;

-- ── Guardado: acepta franja_start/franja_end y regenera el texto ─────────────
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
  v_fs time; v_fe time; v_franja text;
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
    v_fs := nullif(d->>'franja_start','')::time;
    v_fe := nullif(d->>'franja_end','')::time;
    -- El texto de franja se deriva de las horas cuando existen (display/PDF).
    v_franja := case when v_fs is not null and v_fe is not null
                     then to_char(v_fs,'HH24:MI') || ' - ' || to_char(v_fe,'HH24:MI')
                     else coalesce(d->>'franja','') end;
    insert into content_grid_days (grid_id, day_index, date, format_badge, idea, copy_sugerido,
                                   franja, franja_start, franja_end, extra_type, extra_title, extra_desc, extra_items, refs)
    values (
      p_grid_id,
      (d->>'day_index')::int,
      (d->>'date')::date,
      coalesce(d->>'format_badge', 'flyer_foto'),
      coalesce(d->>'idea', ''),
      coalesce(d->>'copy_sugerido', ''),
      v_franja, v_fs, v_fe,
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
          franja_start = excluded.franja_start,
          franja_end = excluded.franja_end,
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

-- Re-derivar las parrillas existentes con el nuevo modelo (franja estructurada,
-- fuente, internas). Solo las no enviadas (el guard protege las enviadas).
do $$
declare g record;
begin
  for g in select id from content_grids where status <> 'enviada' loop
    -- misma lógica que la RPC pero sin el gate (sesión de migración sin auth.uid)
    with nuevas as (
      select d.grid_id, d.date as day_date, 'instagram'::text as network,
             case when d.format_badge = 'video_corto' then 'reel' else 'publicacion' end as task_type,
             1 as qty, nullif(d.franja,'') as franja, d.franja_start, d.franja_end,
             true as verificable, nullif(left(d.idea,200),'') as detalle, 'promolog'::text as verify_source
      from content_grid_days d where d.grid_id = g.id
      union all
      select d.grid_id, d.date, 'instagram', 'reel', 1, null, null, null, true,
             'Reel del día (referencias en la parrilla)', 'promolog'
      from content_grid_days d where d.grid_id = g.id and d.extra_type = 'reel' and d.format_badge <> 'video_corto'
      union all
      select d.grid_id, d.date, 'telegram', 'tg_publicacion',
             least(greatest(coalesce(jsonb_array_length(d.extra_items),0),3),10), null, null, null, true,
             coalesce(nullif(d.extra_title,''), 'Publicaciones del día en Telegram'), 'telegram_scan'
      from content_grid_days d where d.grid_id = g.id and d.extra_type = 'tg_3pub'
      union all
      select d.grid_id, d.date, 'telegram', 'tg_audio', 1, null, null, null, true,
             'Audio de buenos días (existencia; sin transcripción)', 'telegram_scan'
      from content_grid_days d where d.grid_id = g.id and d.extra_type = 'tg_audio'
      union all
      select d.grid_id, d.date, n.network, 'urgencia', 1, null, null, null, true, nullif(d.extra_title,''),
             case n.network when 'x' then 'promolog' else 'telegram_scan' end
      from content_grid_days d cross join (values ('x'),('telegram')) as n(network)
      where d.grid_id = g.id and d.extra_type in ('dinamica_lanzamiento','dinamica_cierre')
      union all
      select d.grid_id, d.date, null, 'interna', 1, null, null, null, false,
             coalesce(nullif(d.extra_title,''), nullif(left(d.extra_desc,200),''), 'Acción interna'), null
      from content_grid_days d where d.grid_id = g.id and d.extra_type = 'custom'
        and (nullif(d.extra_title,'') is not null or nullif(d.extra_desc,'') is not null)
    ),
    up as (
      insert into content_grid_tasks
        (grid_id, day_date, network, task_type, qty, franja, franja_start, franja_end, verificable, detalle, verify_source)
      select grid_id, day_date, network, task_type, qty, franja, franja_start, franja_end, verificable, detalle, verify_source
      from nuevas
      on conflict (grid_id, day_date, coalesce(network,'-'), task_type) do update
        set qty = excluded.qty, franja = excluded.franja,
            franja_start = excluded.franja_start, franja_end = excluded.franja_end,
            verificable = excluded.verificable, detalle = excluded.detalle,
            verify_source = excluded.verify_source
      returning id
    )
    delete from content_grid_tasks t where t.grid_id = g.id and t.id not in (select id from up);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
