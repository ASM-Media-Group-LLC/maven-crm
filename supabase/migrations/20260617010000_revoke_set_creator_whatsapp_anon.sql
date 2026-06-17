-- Hardening: Supabase auto-otorga EXECUTE a anon/authenticated por default
-- privileges al crear una función. anon no debe poder invocar set_creator_whatsapp
-- (la función ya rechaza internamente con auth.uid() null; esto es defensa en
-- profundidad + limpia el advisor anon_security_definer_function_executable).
-- Aplicada vía MCP (revoke_set_creator_whatsapp_from_anon) el 2026-06-17.
revoke execute on function public.set_creator_whatsapp(uuid, text) from anon;
