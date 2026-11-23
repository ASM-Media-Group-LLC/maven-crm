-- Si ya no es miembro, la aprobación antigua no equivale a acceso vigente.
-- Reabre la solicitud para que un responsable autorice el reingreso.
-- Los rechazos se conservan y los reintentos pendientes no duplican solicitudes.
create or replace function public.cowork_solicitar_acceso(_session uuid,_room uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); empresa uuid;
begin
 select s.tenant_id into empresa from public.cowork_sessions s
 join public.tenant_members m on m.tenant_id=s.tenant_id and m.user_id=uid
 join public.profiles p on p.id=uid and p.deleted_at is null
 where s.id=_session and s.status='active';
 if empresa is null or public.posicion_decision(uid,'Cowork|*') is false then
   raise exception 'No tienes acceso a este Cowork' using errcode='42501'; end if;
 if _room is not null and not exists(select 1 from public.cowork_rooms where id=_room and session_id=_session) then
   raise exception 'La sala no pertenece a este Cowork'; end if;
 perform pg_advisory_xact_lock(hashtextextended('cowork-acceso:'||_session::text||':'||uid::text,0));
 if exists(select 1 from public.cowork_memberships where session_id=_session and user_id=uid) then
   return jsonb_build_object('estado','miembro','sessionId',_session,'pendingApproval',false);
 end if;
 insert into public.cowork_solicitudes_acceso(tenant_id,session_id,user_id,room_id)
 values(empresa,_session,uid,_room) on conflict(session_id,user_id) do update
   set estado='pendiente',room_id=excluded.room_id,resuelto_por=null,updated_at=now()
   where cowork_solicitudes_acceso.estado='aprobada';
 return public.cowork_mi_solicitud(_session);
end $$;
