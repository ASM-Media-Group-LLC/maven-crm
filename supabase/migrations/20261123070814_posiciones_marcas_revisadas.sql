-- Deshabilitar una cuenta o protegerla requiere la misma revisión que sus accesos.
revoke insert,update,delete on public.personas_borrador_marcas from authenticated;
create or replace function public.persona_aplicar_marcas(_user_id uuid,_revision timestamptz,_protegido boolean,_deshabilitada boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid:=auth.uid(); empresa uuid:=public.current_tenant_id(); actual public.personas_borrador_marcas%rowtype; antes jsonb;
 anterior text:=current_setting('maven.posiciones_aplicando',true);
begin
 if actor is null or not exists(select 1 from public.tenant_owners o where o.user_id=actor and o.tenant_id=empresa) then raise exception 'Solo el dueño puede proteger o deshabilitar cuentas' using errcode='42501'; end if;
 if _protegido is null or _deshabilitada is null then raise exception 'Estado inválido' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('posiciones:'||empresa::text,0));
 perform 1 from public.profiles p join public.tenant_members m on m.user_id=p.id where p.id=_user_id and p.deleted_at is null and m.tenant_id=empresa for update of p;
 if not found or public.es_dueno(_user_id) then raise exception 'Esta cuenta está protegida o no pertenece a tu empresa' using errcode='42501'; end if;
 select * into actual from public.personas_borrador_marcas where user_id=_user_id for update;
 if actual.updated_at is distinct from _revision then raise exception 'La cuenta cambió. Revisa los cambios de nuevo' using errcode='40001'; end if;
 if coalesce(actual.protegido,false)=_protegido and coalesce(actual.deshabilitada,false)=_deshabilitada then return; end if;
 antes:=jsonb_build_object('protegido',coalesce(actual.protegido,false),'deshabilitada',coalesce(actual.deshabilitada,false));
 perform set_config('maven.posiciones_aplicando','on',true);
 insert into public.personas_borrador_marcas(user_id,protegido,deshabilitada,updated_at) values(_user_id,_protegido,_deshabilitada,clock_timestamp())
 on conflict(user_id) do update set protegido=excluded.protegido,deshabilitada=excluded.deshabilitada,updated_at=excluded.updated_at;
 insert into public.personas_accesos_auditoria(tenant_id,user_id,actor,antes,despues)
 values(empresa,_user_id,actor,antes,jsonb_build_object('protegido',_protegido,'deshabilitada',_deshabilitada));
 perform public.posiciones_sincronizar();
 perform set_config('maven.posiciones_aplicando',coalesce(anterior,''),true);
end $$;
revoke all on function public.persona_aplicar_marcas(uuid,timestamptz,boolean,boolean) from public,anon;
grant execute on function public.persona_aplicar_marcas(uuid,timestamptz,boolean,boolean) to authenticated;
