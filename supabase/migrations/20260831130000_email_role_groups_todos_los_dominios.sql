-- Los grupos de correo por rol ahora incluyen CUALQUIER dominio.
--
-- EL PROBLEMA: el padrón solo miraba `@maven-ai.me` y `@unlok.me`. Cualquier
-- otro correo —el gmail o el hotmail de alguien que entra antes de tener casilla
-- propia— quedaba fuera de TODOS los grupos, incluido `equipo@`, y en absoluto
-- silencio: sin error, sin registro, sin nada que mirar. El único rastro era el
-- contador `desired` en `email_role_groups.last_sync_result`, que dice "24" pero
-- no dice que debían ser 25, y que ninguna pantalla de Maven muestra.
--
-- Pasó de verdad: una persona con rol `employee`, dada de alta el 27/08 con un
-- correo personal, no estaba en ninguna lista. Si RH mandaba algo a `equipo@`,
-- a ella no le llegaba y nadie tenía forma de notarlo.
--
-- Y no era solo que no la agregara: el sync SACA del grupo a todo el que no esté
-- en este padrón. Así que agregarla a mano en la consola de Zoho tampoco servía
-- —el cron de las 08:00 UTC la expulsaba esa misma noche—, lo cual contradecía
-- el propio `access_type = 'Public'`, que existe justamente para admitir gente
-- de afuera (RH manda desde Google).
--
-- El filtro estaba para excluir cuentas de prueba, pero eso castiga el caso real
-- para resolver uno de laboratorio. La forma de dejar a alguien fuera de las
-- listas es NO darle rol en Maven, no que su correo tenga cierto dominio.
--
-- ⚠️ CONSECUENCIA A TENER EN CUENTA: `handle_new_user()` le pone rol `employee`
-- por defecto a todo usuario nuevo, así que de ahora en más cualquier alta entra
-- automáticamente a `empleados@` y a `equipo@` en el próximo cron. Si hay una
-- cuenta de prueba con rol, ahora también entra: quitarle el rol la saca.
--
-- Se conservan dos guardas que NO son de dominio sino de sanidad, y las dos
-- pesan más ahora que las direcciones ya no vienen todas de un dominio nuestro:
--
--   · `deleted_at is null` — Supabase borra usuarios en dos pasos, y un usuario
--     borrado en blando seguía en las listas para siempre, recibiendo el correo
--     interno de la empresa. (No estaba antes; es un agujero que ya existía.)
--
--   · el correo tiene que parecer un correo — `addGroupMembers` manda la tanda
--     COMPLETA en una sola llamada a Zoho, así que UNA dirección basura hace
--     fallar el agregado de todo el grupo, no solo el suyo. Con dominios libres
--     eso pasa de improbable a cuestión de tiempo.
--
-- NO se filtra por `banned_until`: si a alguien suspendido le corresponde o no
-- seguir en las listas es una decisión de RH, no algo que este sync deba asumir.

create or replace function public.role_group_members()
returns table (role text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select ur.role, lower(u.email)
  from public.user_roles ur
  join auth.users u on u.id = ur.user_id
  where u.deleted_at is null
    and u.email is not null
    and u.email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
$$;

revoke all on function public.role_group_members() from anon, authenticated;
