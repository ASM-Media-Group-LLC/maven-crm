-- El karma del Messenger solo se usa con sesión: get_karma_profile y send_karma
-- (SECURITY DEFINER) se podían llamar con la llave pública (anon) y sin iniciar
-- sesión, porque CREATE FUNCTION le da EXECUTE a PUBLIC por defecto. Con el id de
-- una persona, get_karma_profile devolvía su nombre y su correo a cualquiera.
-- La app las llama solo desde el Messenger (useKarmaProfile.ts), con sesión.
-- No toma candados de tabla.
revoke execute on function public.get_karma_profile(uuid) from public, anon;
revoke execute on function public.send_karma(uuid) from public, anon;
grant execute on function public.get_karma_profile(uuid) to authenticated, service_role;
grant execute on function public.send_karma(uuid) to authenticated, service_role;
