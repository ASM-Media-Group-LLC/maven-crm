-- Los ingresos nuevos pueden tener nivel heredado vacío. Solo se usa su nivel
-- de rol comprobado, inferior al supervisor y dentro del mismo equipo.
-- Actions must consume the effective position decision at their server entry.
create or replace function public.posicion_persona_en_alcance(_caller uuid,_target uuid,_funcion text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(_caller is not null and _target is not null
   and exists(select 1 from public.tenant_members a join public.tenant_members b on b.tenant_id=a.tenant_id
     where a.user_id=_caller and b.user_id=_target)
   and public.tiene_funcion(_caller,_funcion)
   and (public.es_dueno(_caller) or exists(
     select 1 from public.posiciones_borrador_personas a
     join public.posiciones_borrador p on p.id=a.posicion_id
     join public.tenant_members m on m.user_id=a.user_id and m.tenant_id=p.tenant_id
     join public.posiciones_funciones_catalogo() c on c.clave=_funcion
     where a.user_id=_caller and p.activa and (p.acceso_total or (p.checks->_funcion='true'::jsonb and
       case coalesce(p.alcances->>c.fila,'all')
         when 'all' then true
         when 'self' then _caller=_target
         when 'subordinates' then _caller=_target or exists(
           select 1 from public.profiles yo cross join public.profiles t
           where yo.id=_caller and t.id=_target and yo.deleted_at is null and not public.es_admin_o_dueno(t.id)
           and ((yo.nivel='supervisor' and (t.nivel='agente' or (t.nivel is null and public.actor_level(t.id)>0 and public.actor_level(t.id)<public.actor_level(yo.id))) and public.equipo_de(yo.id)<>'Otros' and public.equipo_de(yo.id)=public.equipo_de(t.id))
             or exists(select 1 from public.equipos_a_cargo e where e.user_id=_caller and e.tenant_id=p.tenant_id and e.equipo=public.equipo_de(t.id)))
         )
         else false end
     )))
   ),false);
$$;
revoke all on function public.posicion_persona_en_alcance(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.posicion_persona_en_alcance(uuid,uuid,text) to service_role;


-- Una purga de la persona no debe borrar el historial de otros ni bloquearse.
alter table public.cowork_solicitudes_acceso
 drop constraint cowork_solicitudes_acceso_user_id_fkey,
 add constraint cowork_solicitudes_acceso_user_id_fkey foreign key(user_id) references public.profiles(id) on delete cascade,
 drop constraint cowork_solicitudes_acceso_resuelto_por_fkey,
 add constraint cowork_solicitudes_acceso_resuelto_por_fkey foreign key(resuelto_por) references public.profiles(id) on delete set null;
alter table public.cowork_accesos_auditoria
 alter column user_id drop not null,
 alter column actor drop not null,
 drop constraint cowork_accesos_auditoria_user_id_fkey,
 add constraint cowork_accesos_auditoria_user_id_fkey foreign key(user_id) references public.profiles(id) on delete set null,
 drop constraint cowork_accesos_auditoria_actor_fkey,
 add constraint cowork_accesos_auditoria_actor_fkey foreign key(actor) references public.profiles(id) on delete set null;
