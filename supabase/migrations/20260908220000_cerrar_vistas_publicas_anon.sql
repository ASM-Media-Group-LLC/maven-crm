-- TANDA 1: sacarle a `anon` (sin sesión) el acceso a vistas internas.
--
-- Estas vistas se crearon SIN `security_invoker`, así que corren como su dueño
-- (postgres) y NO aplican la RLS de las tablas que consultan. Sumado al GRANT por
-- defecto de Supabase a `anon`, cualquiera con la clave pública del frontend —que
-- está en el bundle del navegador— podía leerlas sin iniciar sesión:
--
--   whatsapp_commitments_overdue ... 702 filas: quién se comprometió a qué, en qué
--                                    grupo, con nombre y nota de resolución
--   whatsapp_costs_by_group_month ... 64 filas: costo del bot por grupo y mes
--   v_dominio_legacy_resumen ......... 27 filas: visitas del dominio viejo
--   employees_directory .............. directorio de empleados
--
-- Verificado antes de tocar: ningún flujo anónimo legítimo las usa. La única que
-- tiene consumidor en el front es whatsapp_costs_by_group_month
-- (useWhatsappAgent.ts:255, Panel de Control) y ese va SIEMPRE con sesión.
--
-- NO se les toca el `security_invoker`: `employees_directory` bypassa la RLS a
-- propósito (PR #545, para que el directorio funcione en Dashboard y Anuncios) y
-- cambiarlo rompería esas pantallas. Acá solo se cierra el acceso anónimo.
--
-- ⚠️ NO se toca `chatter_sessions` ni nada del Chatter Evaluator: su policy
-- `chatter_sessions_anon_read` es DELIBERADA — es el link público que se comparte
-- con los candidatos para que hagan la prueba sin cuenta (aviso de Jhon, 08/09).
-- Verificado después de aplicar: anon sigue leyendo 257 sesiones, 8.143 mensajes
-- y 21 items del vault, o sea el flujo del candidato quedó intacto.

revoke all on public.whatsapp_commitments_overdue  from anon;
revoke all on public.whatsapp_costs_by_group_month from anon;
revoke all on public.v_dominio_legacy_resumen      from anon;
revoke all on public.employees_directory           from anon;
