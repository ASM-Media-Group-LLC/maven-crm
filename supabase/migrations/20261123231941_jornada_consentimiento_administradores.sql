-- Registrar jornada administrativa no equivale a aceptar monitoreo.
-- Las personas sujetas al aviso conservan la aceptación explícita anterior.
create or replace function public.mi_jornada_config()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'sin sesión' using errcode='42501'; end if;
 return (select to_jsonb(c) || jsonb_build_object('requiere_terminos',not public.es_admin_o_dueno(auth.uid()))
   from public.jornada_config_de(auth.uid()) c);
end $$;
revoke all on function public.mi_jornada_config() from public,anon;
grant execute on function public.mi_jornada_config() to authenticated;

CREATE OR REPLACE FUNCTION public.turno_entrar()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_t record;
begin
  if v_uid is null then raise exception 'sin sesión' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('jornada:'||v_uid::text,0));
  if not coalesce((select c.registra_horas from public.jornada_config_de(v_uid) c),false) then
    raise exception 'El registro de horas no está habilitado para tu posición' using errcode='42501';
  end if;
  if exists (select 1 from public.turno_marcas m where m.user_id = v_uid and m.fin is null) then return; end if;
  if not public.es_admin_o_dueno(v_uid) and not exists (select 1 from public.turno_terminos tt where tt.user_id = v_uid and tt.version >= public.turno_terminos_version()) then
    raise exception 'turno_entrar: primero acepta las reglas de monitoreo' using errcode = 'P0001';
  end if;
  select x.inicio, x.fin into v_t from public.turno_que_toca(v_uid, now()) x;
  if v_t.inicio is not null and now() < v_t.inicio - interval '15 minutes' then
    raise exception 'turno_entrar: todavía no es tu hora (desde las %)', to_char((v_t.inicio - interval '15 minutes') at time zone 'America/Bogota', 'HH12:MI AM')
      using errcode = 'P0001';
  end if;
  insert into public.turno_marcas (user_id, inicio) values (v_uid, now());
end;
$function$
;
