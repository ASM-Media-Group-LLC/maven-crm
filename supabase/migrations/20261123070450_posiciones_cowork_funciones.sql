-- La casilla de supervisión se aplica a vistas de otras salas y al Hub.
-- Las personas que conversan dentro de la misma sala siguen compartiendo pantalla entre ellas.
create or replace function public.cowork_ven_pantallas_del_hub()
returns uuid[] language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(array_agg(distinct m.user_id),'{}')
 from public.tenant_members m join public.profiles p on p.id=m.user_id and p.deleted_at is null
 where m.tenant_id=(select public.current_tenant_id())
 and case when public.posiciones_controlan(m.user_id)
 then public.posicion_persona_en_alcance(m.user_id,(select auth.uid()),'N:cowork.verpantallas')
 else public.is_in_role_group(m.user_id,'admin') end;
$$;

create or replace function public.is_cowork_host(_user_id uuid,_session_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.posicion_decision(_user_id,'N:cowork.abrir') is distinct from false
 and public.posicion_decision(_user_id,'Cowork|*') is distinct from false
 and exists(select 1 from public.cowork_memberships m join public.cowork_sessions s on s.id=m.session_id
   join public.tenant_members t on t.user_id=_user_id and t.tenant_id=s.tenant_id
   where m.user_id=_user_id and m.session_id=_session_id and m.role='host');
$$;

create or replace function public.cowork_posicion_ver_sala(_session uuid,_room text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); target uuid;
begin
 if not public.posiciones_controlan(actor) then return null; end if;
 if not public.tiene_funcion(actor,'Cowork|*') or not public.tiene_funcion(actor,'N:cowork.verpantallas') then return false; end if;
 if not exists(select 1 from public.cowork_sessions s where s.id=_session and s.tenant_id=public.current_tenant_id()) then return false; end if;
 if _room='hub' then
   for target in select m.user_id from public.cowork_memberships m where m.session_id=_session and m.role='host' loop
     if not public.posicion_persona_en_alcance(actor,target,'N:cowork.verpantallas') then return false; end if;
   end loop;
 else
   if _room is null or _room !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or not exists(select 1 from public.cowork_rooms r where r.id=_room::uuid and r.session_id=_session) then return false; end if;
   for target in select a.user_id from public.cowork_room_assignments a where a.session_id=_session and a.room_id=_room::uuid and a.is_active loop
     if not public.posicion_persona_en_alcance(actor,target,'N:cowork.verpantallas') then return false; end if;
   end loop;
 end if;
 return true;
end $$;
revoke all on function public.cowork_posicion_ver_sala(uuid,text) from public,anon;
grant execute on function public.cowork_posicion_ver_sala(uuid,text) to authenticated;
create or replace function public.cowork_puede_supervisar(_user_id uuid,_session_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_user_id) then
   public.tiene_funcion(_user_id,'N:cowork.abrir') and public.tiene_funcion(_user_id,'Cowork|*')
   and exists(select 1 from public.cowork_sessions s join public.tenant_members m on m.tenant_id=s.tenant_id and m.user_id=_user_id
     where s.id=_session_id and (public.is_cowork_host(_user_id,s.id) or public.posicion_persona_en_alcance(_user_id,s.created_by,'N:cowork.abrir')))
 else (-- Solo sesiones de la propia agencia (20261001213000); el alcance de los
  -- roles ya es por agencia, pero sin esto miraba sesiones de cualquiera.
  select exists (
           select 1
           from public.cowork_sessions s0
           join public.tenant_members tm on tm.tenant_id = s0.tenant_id and tm.user_id = _user_id
           where s0.id = _session_id
         )
     and (
       public.has_cowork_global_scope(_user_id)
       or (
         public.has_cowork_team_scope(_user_id)
         and exists (
           select 1 from public.cowork_sessions s
           where s.id = _session_id
             and public.actor_level(s.created_by) < public.actor_level(_user_id)
         )
       )
     )) end;
$$;
