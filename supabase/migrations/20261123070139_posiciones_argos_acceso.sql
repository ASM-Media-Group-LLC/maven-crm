-- Los puestos personalizados gobiernan presencia y expediente sin depender del nombre HR/admin.
create or replace function public.puede_vigilar_a(_viewer uuid,_target uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan(_viewer) then _viewer<>_target and
   (public.posicion_persona_en_alcance(_viewer,_target,'N:argos.presencia') or public.posicion_persona_en_alcance(_viewer,_target,'N:argos.expediente'))
 else (select _viewer is not null and _target is not null and _viewer <> _target
     and exists (select 1 from public.profiles t where t.id = _target and t.deleted_at is null)
     and (
       public.es_admin_o_dueno(_viewer)
       or (public.es_rh(_viewer) and not public.es_admin_o_dueno(_target))
       -- Supervisor → agentes de su equipo y de su agencia (= mi_equipo_supervisado).
       or exists (
         select 1
           from public.profiles s
           join public.profiles t on t.id = _target and t.nivel = 'agente' and t.deleted_at is null
          where s.id = _viewer and s.nivel = 'supervisor' and s.deleted_at is null
            and public.equipo_de(s.id) <> 'Otros'
            and public.equipo_de(s.id) = public.equipo_de(t.id)
            and exists (
              select 1 from public.user_roles a
                join public.user_roles b on b.tenant_id = a.tenant_id
               where a.user_id = s.id and b.user_id = t.id
            )
       )
       -- Jefe con ese equipo a cargo (no admins ni dueño), de su agencia.
       or (
         not public.es_admin_o_dueno(_target)
         and exists (select 1 from public.equipos_a_cargo e where e.user_id = _viewer and e.equipo = public.equipo_de(_target))
         and exists (
           select 1 from public.user_roles a
             join public.user_roles b on b.tenant_id = a.tenant_id
            where a.user_id = _viewer and b.user_id = _target
         )
       )
     )) end;
$$;

create or replace function public.argos_posicion_ve(_target uuid,_funcion text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select public.posicion_persona_en_alcance((select auth.uid()),_target,_funcion);
$$;
revoke all on function public.argos_posicion_ve(uuid,text) from public,anon;
grant execute on function public.argos_posicion_ve(uuid,text) to authenticated;

create or replace function public.posicion_argos_carpeta(_carpeta text,_funcion text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if _carpeta is null or _carpeta !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 return public.posicion_persona_en_alcance(auth.uid(),_carpeta::uuid,_funcion);
end $$;
revoke all on function public.posicion_argos_carpeta(text,text) from public,anon;
grant execute on function public.posicion_argos_carpeta(text,text) to authenticated;

create policy posiciones_lectura on public.monitor_capturas as restrictive for select to authenticated
 using (not public.posiciones_controlan((select auth.uid())) or user_id=(select auth.uid()) or (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));
create policy posiciones_lectura_concedida on public.monitor_capturas for select to authenticated
 using (public.posiciones_controlan((select auth.uid())) and (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));

create policy posiciones_lectura on public.monitor_eventos as restrictive for select to authenticated
 using (not public.posiciones_controlan((select auth.uid())) or user_id=(select auth.uid()) or (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));
create policy posiciones_lectura_concedida on public.monitor_eventos for select to authenticated
 using (public.posiciones_controlan((select auth.uid())) and (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));

create policy posiciones_lectura on public.monitor_rondas as restrictive for select to authenticated
 using (not public.posiciones_controlan((select auth.uid())) or user_id=(select auth.uid()) or (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));
create policy posiciones_lectura_concedida on public.monitor_rondas for select to authenticated
 using (public.posiciones_controlan((select auth.uid())) and (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));

create policy posiciones_lectura on public.argos_alertas as restrictive for select to authenticated
 using (not public.posiciones_controlan((select auth.uid())) or user_id=(select auth.uid()) or (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));
create policy posiciones_lectura_concedida on public.argos_alertas for select to authenticated
 using (public.posiciones_controlan((select auth.uid())) and (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));

create policy posiciones_lectura on public.argos_nudges as restrictive for select to authenticated
 using (not public.posiciones_controlan((select auth.uid())) or user_id=(select auth.uid()) or (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));
create policy posiciones_lectura_concedida on public.argos_nudges for select to authenticated
 using (public.posiciones_controlan((select auth.uid())) and (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));

create policy posiciones_lectura on public.argos_uso_apps as restrictive for select to authenticated
 using (not public.posiciones_controlan((select auth.uid())) or user_id=(select auth.uid()) or (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));
create policy posiciones_lectura_concedida on public.argos_uso_apps for select to authenticated
 using (public.posiciones_controlan((select auth.uid())) and (public.argos_posicion_ve(user_id,'N:argos.presencia') or public.argos_posicion_ve(user_id,'N:argos.expediente')));

create policy posiciones_video on public.monitor_clips as restrictive for select to authenticated
 using (not public.posiciones_controlan((select auth.uid())) or public.argos_posicion_ve(user_id,'N:argos.video'));
create policy posiciones_video_concedido on public.monitor_clips for select to authenticated
 using (public.posiciones_controlan((select auth.uid())) and public.argos_posicion_ve(user_id,'N:argos.video'));

create policy posiciones_video on public.argos_clips as restrictive for select to authenticated
 using (not public.posiciones_controlan((select auth.uid())) or public.argos_posicion_ve(user_id,'N:argos.video'));
create policy posiciones_video_concedido on public.argos_clips for select to authenticated
 using (public.posiciones_controlan((select auth.uid())) and public.argos_posicion_ve(user_id,'N:argos.video'));

create policy posiciones_clips on storage.objects as restrictive for select to authenticated
 using(bucket_id<>'argos-clips' or not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_carpeta((storage.foldername(name))[1],'N:argos.video'));
create policy posiciones_clips_concedidos on storage.objects for select to authenticated
 using(bucket_id='argos-clips' and public.posiciones_controlan((select auth.uid())) and public.posicion_argos_carpeta((storage.foldername(name))[1],'N:argos.video'));

-- Este ajuste es global en la operación actual. No habilitarlo para una segunda empresa sin particionarlo.
create or replace function public.posicion_argos_configura()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select (select count(*)=1 from public.tenants) and public.posicion_decision((select auth.uid()),'N:argos.ajustes') is true;
$$;
revoke all on function public.posicion_argos_configura() from public,anon;
grant execute on function public.posicion_argos_configura() to authenticated;
create policy posiciones_config on public.monitor_config as restrictive for update to authenticated
 using(not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_configura())
 with check(not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_configura());
create policy posiciones_config_concedida on public.monitor_config for update to authenticated
 using(public.posicion_argos_configura()) with check(public.posicion_argos_configura());
create policy posiciones_ajustes_select on public.argos_voz as restrictive for select to authenticated
 using(not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_configura());
create policy posiciones_ajustes_concedidos_select on public.argos_voz for select to authenticated
 using(public.posicion_argos_configura());
create policy posiciones_ajustes_update on public.argos_voz as restrictive for update to authenticated
 using(not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_configura()) with check(not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_configura());
create policy posiciones_ajustes_concedidos_update on public.argos_voz for update to authenticated
 using(public.posicion_argos_configura()) with check(public.posicion_argos_configura());
create policy posiciones_ajustes_select on public.argos_situaciones as restrictive for select to authenticated
 using(not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_configura());
create policy posiciones_ajustes_concedidos_select on public.argos_situaciones for select to authenticated
 using(public.posicion_argos_configura());
create policy posiciones_ajustes_update on public.argos_situaciones as restrictive for update to authenticated
 using(not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_configura()) with check(not public.posiciones_controlan((select auth.uid())) or public.posicion_argos_configura());
create policy posiciones_ajustes_concedidos_update on public.argos_situaciones for update to authenticated
 using(public.posicion_argos_configura()) with check(public.posicion_argos_configura());
create policy posiciones_contexto_select on public.argos_contexto for select to authenticated using(public.posicion_decision((select auth.uid()),'N:argos.ajustes') is true and tenant_id=(select public.current_tenant_id()));
create policy posiciones_contexto_insert on public.argos_contexto for insert to authenticated with check(public.posicion_decision((select auth.uid()),'N:argos.ajustes') is true and tenant_id=(select public.current_tenant_id()));
create policy posiciones_contexto_update on public.argos_contexto for update to authenticated using(public.posicion_decision((select auth.uid()),'N:argos.ajustes') is true and tenant_id=(select public.current_tenant_id())) with check(public.posicion_decision((select auth.uid()),'N:argos.ajustes') is true and tenant_id=(select public.current_tenant_id()));

-- Fotografías y vídeo en vivo son entradas diferentes: expediente no concede una cámara en directo.
create or replace function public.puede_vigilar(_target uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan((select auth.uid()))
 then public.posicion_persona_en_alcance((select auth.uid()),_target,'N:argos.presencia')
 else public.puede_vigilar_a((select auth.uid()),_target) end;
$$;
create or replace function public.argos_puede_ver_foto(_viewer uuid,_target uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.tenant_members a join public.tenant_members b on b.tenant_id=a.tenant_id where a.user_id=_viewer and b.user_id=_target)
 and case when public.posiciones_controlan(_viewer) then
 (public.posicion_persona_en_alcance(_viewer,_target,'N:argos.presencia') or public.posicion_persona_en_alcance(_viewer,_target,'N:argos.expediente'))
 else public.puede_vigilar_a(_viewer,_target) or public.es_admin_o_dueno(_viewer) end;
$$;
revoke all on function public.argos_puede_ver_foto(uuid,uuid) from public,anon,authenticated;
grant execute on function public.argos_puede_ver_foto(uuid,uuid) to service_role;

create or replace function public.ve_argos()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan((select auth.uid())) then
 exists(select 1 from public.posiciones_funciones_catalogo() c where c.clave in ('N:argos.presencia','N:argos.expediente','N:argos.ajustes','N:argos.casos.juzgar','N:argos.casos.corregir') and public.tiene_funcion((select auth.uid()),c.clave))
 else (select coalesce(public.es_admin_o_dueno((select auth.uid())), false)
      or coalesce(public.es_rh((select auth.uid())), false)
      or exists (
        select 1 from public.profiles p
         where p.id = (select auth.uid()) and p.nivel = 'supervisor' and p.deleted_at is null
      )
      or exists (select 1 from public.equipos_a_cargo e where e.user_id = (select auth.uid()))) end;
$$;

create or replace function public.argos_puede_abrir_expediente(_target uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when public.posiciones_controlan((select auth.uid())) then public.posicion_persona_en_alcance((select auth.uid()),_target,'N:argos.expediente')
 else public.puede_vigilar_a((select auth.uid()),_target) or _target=(select auth.uid()) end;
$$;
revoke all on function public.argos_puede_abrir_expediente(uuid) from public,anon;
grant execute on function public.argos_puede_abrir_expediente(uuid) to authenticated;
