-- Push al HOST de la sesión de Cowork cuando el detector registra un llamado de
-- atención (cámara apagada, mal encuadre, sin luz, sin compartir pantalla).
-- Decisión de Jhon (06/09/2026): solo al host, no a la persona llamada — ella
-- tiene Cowork abierto por definición (su navegador generó el llamado) y ya ve
-- el aviso en pantalla; a quien le sirve el push es al supervisor que no está
-- mirando el tablero.
--
-- Un push por EPISODIO gratis: cowork-session escribe estos llamados con UPSERT
-- (user_id, kind, nonce), así que el INSERT solo dispara al abrir el episodio y
-- las extensiones de `seconds` caen en la rama UPDATE.
create or replace function public.push_cowork_llamado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hosts uuid[];
  v_nombre text;
  v_sesion text;
  v_que text;
begin
  select array_agg(m.user_id) into v_hosts
  from cowork_memberships m
  where m.session_id = new.session_id
    and m.role = 'host'
    and m.user_id <> new.user_id;
  if v_hosts is null then
    return null;
  end if;

  select p.full_name into v_nombre from profiles p where p.id = new.user_id;
  select s.name into v_sesion from cowork_sessions s where s.id = new.session_id;
  v_que := case new.kind
    when 'camara'   then 'cámara apagada'
    when 'encuadre' then 'mal encuadre'
    when 'luz'      then 'sin luz'
    when 'pantalla' then 'sin compartir pantalla'
    else new.kind
  end;

  perform public.push_notify_enqueue(
    'cowork_llamado',
    v_hosts,
    jsonb_build_object('llamado_id', new.id, 'session_id', new.session_id, 'user_id', new.user_id, 'kind', new.kind),
    'Llamado de atención · Cowork',
    coalesce(nullif(v_nombre, ''), 'Alguien') || ': ' || v_que || coalesce(' · ' || nullif(v_sesion, ''), ''),
    '/cowork?session=' || new.session_id,
    'cowork-llamado-' || new.session_id,
    'normal'
  );
  return null;
end
$$;

revoke all on function public.push_cowork_llamado() from public, anon, authenticated;

drop trigger if exists on_cowork_llamado_push on public.cowork_llamados;
create trigger on_cowork_llamado_push
  after insert on public.cowork_llamados
  for each row execute function public.push_cowork_llamado();
