-- El super admin de la plataforma pasa a Alvaro (ASM Tech, administrador actual).
-- Se retira al administrador anterior. Idempotente y por correo, igual que el
-- seed original de 20261001210000_agencias_base.sql. La tabla plataforma_admins
-- no se escribe desde la app (RLS sin políticas), por eso el traspaso va por
-- migración aplicada con service_role.

insert into public.plataforma_admins (user_id)
select id from auth.users where lower(email) = 'alvaro@maven-ai.me'
on conflict (user_id) do nothing;

delete from public.plataforma_admins
where user_id in (
  select id from auth.users where lower(email) = 'jhon.lopez@maven-ai.me'
);
