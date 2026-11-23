-- El retorno antiguo restauraba user_roles pero no posiciones ni denegaciones.
-- Se conserva la función para clientes antiguos, fallando con una explicación;
-- la restauración de una versión debe incluir su esquema y estado completos.
create or replace function public.posiciones_regresar()
returns text language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null or not public.es_dueno(auth.uid()) then
    raise exception 'Solo el dueño puede regresar' using errcode = '42501';
  end if;
  raise exception 'Este respaldo es anterior al constructor de permisos. No puede restaurarse sin revisar también las posiciones y restricciones personales.' using errcode = '22023';
end $$;
revoke all on function public.posiciones_regresar() from public, anon;
grant execute on function public.posiciones_regresar() to authenticated;
