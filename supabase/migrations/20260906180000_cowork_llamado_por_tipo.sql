-- Cowork: un evento de aviso POR TIPO de llamado de atención (Jhon, 07/09/2026:
-- "hay muchos tipos de llamados; debería poder escoger por cada tipo: cámara
-- apagada, no se ve bien, no comparte pantalla…").
--
-- El kind del push deja de ser 'cowork_llamado' y pasa a 'cowork_llamado_<kind>'
-- con los cuatro kinds que registra cowork-session: camara, encuadre, luz,
-- pantalla. Así Ajustes → Notificaciones → Eventos muestra cuatro filas y cada
-- una se prende/apaga por canal con notif_canal_activo. El tag también lleva el
-- kind: dos llamados distintos de la misma sala ya no se pisan en el celular.
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
    when 'camara'   then 'Cámara apagada'
    when 'encuadre' then 'Mal encuadre'
    when 'luz'      then 'Sin luz'
    when 'pantalla' then 'No comparte pantalla'
    else new.kind
  end;
  perform public.push_notify_enqueue(
    'cowork_llamado_' || new.kind,
    v_hosts,
    jsonb_build_object('llamado_id', new.id, 'session_id', new.session_id, 'user_id', new.user_id, 'kind', new.kind),
    v_que || ' · Cowork',
    coalesce(nullif(v_nombre, ''), 'Alguien') || coalesce(' · ' || nullif(v_sesion, ''), ''),
    '/cowork?session=' || new.session_id,
    'cowork-llamado-' || new.session_id || '-' || new.kind,
    'normal'
  );
  return null;
end
$$;

-- Quien ya había ajustado el evento genérico conserva su elección en los cuatro.
insert into public.notification_preferences
  (user_id, module, notification_type, channel_in_app, channel_push, channel_email, is_enabled, updated_at)
select np.user_id, np.module, 'cowork_llamado_' || k.kind, np.channel_in_app, np.channel_push, np.channel_email, np.is_enabled, now()
from public.notification_preferences np
cross join (values ('camara'), ('encuadre'), ('luz'), ('pantalla')) as k(kind)
where np.notification_type = 'cowork_llamado'
on conflict (user_id, module, notification_type) do nothing;
delete from public.notification_preferences where notification_type = 'cowork_llamado';
