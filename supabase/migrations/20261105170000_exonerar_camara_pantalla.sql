-- Exonerar de cámara/pantalla (Alvaro, 05/11): a cierta gente NO se le pide tener
-- cámara ni compartir pantalla (ej. Álvaro René). A un exonerado no se le califica
-- en esos dos factores: su nota sale del resto (y se reparte el peso). Se asigna
-- por PERSONA o por ROL, y SOLO el dueño puede ponerlo.

alter table public.profiles
  add column if not exists exonera_camara_pantalla boolean not null default false;
alter table public.roles_config
  add column if not exists exonera_camara_pantalla boolean not null default false;

-- RPC por persona (solo dueño).
create or replace function public.argos_exonerar_persona(_user uuid, _on boolean)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.es_dueno((select auth.uid())) then
    raise exception 'solo el dueño puede exonerar';
  end if;
  update public.profiles set exonera_camara_pantalla = coalesce(_on, false) where id = _user;
end;
$$;

-- RPC por rol (solo dueño).
create or replace function public.argos_exonerar_rol(_role text, _on boolean)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  if not public.es_dueno((select auth.uid())) then
    raise exception 'solo el dueño puede exonerar';
  end if;
  update public.roles_config set exonera_camara_pantalla = coalesce(_on, false)
   where name = _role and tenant_id = (select public.current_tenant_id());
end;
$$;

revoke all on function public.argos_exonerar_persona(uuid, boolean) from public, anon;
revoke all on function public.argos_exonerar_rol(text, boolean) from public, anon;
grant execute on function public.argos_exonerar_persona(uuid, boolean) to authenticated;
grant execute on function public.argos_exonerar_rol(text, boolean) to authenticated;
