-- 26/11/2026 (Alvaro). Aplicado en Kash con su OK (posiciones_vigilancia_no_es_poder
-- y posiciones_delegacion_solo_mando). Aquí queda escrito igual que en la base.
--
-- «Nadie da más de lo que tiene» se aplica SOLO al poder de mando (gestionar gente,
-- posiciones, roles, HR, finanzas, panel, juzgar casos de Argos, ajustes). Las
-- herramientas de trabajo y lo que Argos le vigila a la persona no cuentan.
create or replace function public.posicion_clave_no_es_poder(_clave text)
returns boolean language sql immutable as $$
  select _clave in ('N:argos.apps_ajenas', 'N:argos.casos.obligado')
$$;

create or replace function public.posicion_clave_es_mando(_clave text)
returns boolean language sql immutable as $$
  select _clave like 'Administración|%'
      or _clave like 'N:usr.%'
      or _clave like 'N:pos.%'
      or _clave like 'HR|%'
      or _clave like 'Finanzas|%'
      or _clave like 'Panel de control|%'
      or _clave in ('N:argos.ajustes', 'N:argos.casos.juzgar', 'N:argos.casos.corregir', 'N:argos.casos.jefe',
                    'N:argos.casos.reporte', 'N:argos.perdonar', 'N:camara_pantalla.decidir', 'N:empresa.configurar',
                    'Chatters|Admin', 'Chatters|Borrar Historial')
$$;

CREATE OR REPLACE FUNCTION public.posicion_validar_delegacion(_actor uuid, _p posiciones_borrador)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare k text; r record; rango int; concedido int;
begin
 if exists(select 1 from public.tenant_owners o where o.user_id=_actor and o.tenant_id=_p.tenant_id) then return; end if;
 if _p.acceso_total or _p.todas_creadoras then
   raise exception 'Solo el dueño puede conceder acceso total o a todas las creadoras' using errcode='42501';
 end if;
 for k in select key from jsonb_each(_p.checks) where value='true'::jsonb and public.posicion_clave_es_mando(key) loop
   if not public.tiene_funcion(_actor,k) then raise exception 'No puedes conceder un poder de mando que no tienes: %',k using errcode='42501'; end if;
 end loop;
 for r in select c.clave,c.fila as key,coalesce(_p.alcances->>c.fila,'all') as value
   from public.posiciones_funciones_catalogo() c where _p.checks->c.clave='true'::jsonb and public.posicion_clave_es_mando(c.clave) loop
   rango:=case r.value when 'all' then 3 when 'subordinates' then 2 else 1 end;
   select coalesce(max(case when p.acceso_total then 3 else case coalesce(p.alcances->>r.key,'all') when 'all' then 3 when 'subordinates' then 2 else 1 end end),0)
     into concedido from public.posiciones_borrador p join public.posiciones_borrador_personas a on a.posicion_id=p.id
     where a.user_id=_actor and p.activa and p.tenant_id=_p.tenant_id
       and (p.acceso_total or p.checks->r.clave='true'::jsonb);
   if rango>concedido then raise exception 'No puedes conceder un alcance de mando superior al tuyo: %',r.key using errcode='42501'; end if;
 end loop;
end $function$;
