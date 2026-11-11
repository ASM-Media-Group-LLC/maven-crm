-- CAJA NEGRA DE LAS SUBIDAS DE LAS MODELOS (Alvaro, 11/11/2026).
--
-- Del 5 al 10/11 los videos de más de 350 MB rebotaban (MORAMAY 13 veces,
-- BELIAL 10, VEROODLE 9) y nadie se enteró: solo quedaba registro de un tipo de
-- falla, y nada de lo que pasa en el celular antes de llegar al servidor (se
-- bloquea el teléfono, se va el internet, cierra la página a mitad).
--
-- Ahora la página /aportar/<token> reporta cada intento (edge drive-aporte,
-- action «bitacora»): subiendo, en pausa, listo o falló, con avance y
-- velocidad. Si un intento lleva 15 min sin moverse o falló, el cron le avisa a
-- quien creó el link (campana) para que le escriba a la modelo. Un intento que
-- la misma modelo retomó después (mismo archivo, intento nuevo que terminó o
-- sigue vivo) no avisa.

create table if not exists public.drive_aportar_intentos (
  id uuid primary key,                  -- lo pone la página: un archivo elegido = un intento
  token text not null,
  nombre_archivo text not null,
  size_bytes bigint,
  estado text not null check (estado in ('subiendo', 'pausado', 'ok', 'fallo')),
  pct smallint not null default 0,
  bytes_subidos bigint not null default 0,
  kbps integer,
  pausas integer not null default 0,
  reintentos integer not null default 0,
  mensaje text,
  user_agent text,
  iniciado_at timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  terminado_at timestamptz,
  avisado_at timestamptz
);

create index if not exists drive_aportar_intentos_vivos
  on public.drive_aportar_intentos (actualizado_at)
  where avisado_at is null and estado in ('subiendo', 'pausado', 'fallo');
create index if not exists drive_aportar_intentos_por_link
  on public.drive_aportar_intentos (token, iniciado_at desc);

-- Solo la escribe la edge (service role). Nadie la lee desde el navegador.
alter table public.drive_aportar_intentos enable row level security;

create or replace function public.vigilar_subidas_trabadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select i.id, i.nombre_archivo, i.size_bytes, i.pct, i.estado, i.mensaje,
           l.created_by, l.item_id, coalesce(c.nombre, 'una carpeta') as carpeta
      from public.drive_aportar_intentos i
      join public.drive_upload_links l on l.token = i.token
      left join public.drive_items c on c.id = l.item_id
     where i.avisado_at is null
       and i.iniciado_at > now() - interval '2 days'
       and (i.estado = 'fallo'
            or (i.estado in ('subiendo', 'pausado') and i.actualizado_at < now() - interval '15 minutes'))
       -- La modelo ya lo retomó en otro intento (terminó o sigue vivo): no avisar.
       and not exists (
         select 1 from public.drive_aportar_intentos j
          where j.token = i.token and j.nombre_archivo = i.nombre_archivo
            and j.size_bytes is not distinct from i.size_bytes
            and j.id <> i.id and j.iniciado_at > i.iniciado_at
            and (j.estado = 'ok' or j.actualizado_at > now() - interval '15 minutes'))
     for update of i skip locked
  loop
    update public.drive_aportar_intentos set avisado_at = now() where id = r.id;
    continue when r.created_by is null;

    insert into public.notifications
      (user_id, type, title, message, reference_id, reference_type, module_origin, priority, status, visibility_scope, deep_link_url)
    values (
      r.created_by, 'drive_subida_trabada',
      format('%s no pudo terminar de subir un archivo', r.carpeta),
      format('«%s» (%s) quedó en %s%%. %s',
             r.nombre_archivo, pg_size_pretty(coalesce(r.size_bytes, 0)), r.pct,
             case when r.estado = 'fallo'
                  then format('Falló: %s. Escríbele para que lo vuelva a intentar con el mismo link: sigue desde donde quedó.',
                              coalesce(left(r.mensaje, 160), 'sin detalle'))
                  else 'Lleva más de 15 minutos sin avanzar (bloqueó el teléfono, cerró la página o se quedó sin internet). Escríbele para que abra su link y elija el mismo video: sigue desde donde quedó.'
             end),
      r.item_id, 'drive_carpeta', 'Oficina', 'high', 'new', 'personal',
      case when r.item_id is not null then '/oficina/drive?carpeta=' || r.item_id else '/oficina/drive' end
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.vigilar_subidas_trabadas() from public, anon, authenticated;

select cron.schedule('vigia-subidas-trabadas', '*/5 * * * *', $$ select public.vigilar_subidas_trabadas(); $$);
select cron.schedule('drive-intentos-limpieza', '23 8 * * *',
  $$ delete from public.drive_aportar_intentos where iniciado_at < now() - interval '60 days'; $$);
