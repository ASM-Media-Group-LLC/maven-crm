-- Limpieza de Posiciones y gente (Alvaro, 27/11/2026, respuestas con botones).
-- Ya aplicada en Kash (apply_migration «limpieza_posiciones_27_11»).
-- 1) Cuentas de prueba a la papelera (30 días, se pueden recuperar).
update public.profiles set deleted_at = now()
 where deleted_at is null and full_name in ('hhrr', 'Test', 'test test')
   and not exists (select 1 from public.posiciones_borrador_personas a where a.user_id = profiles.id);
-- 2) Juan Pachas: el rol viejo de «Gestión de personas» le abría Administración → Usuarios.
update public.role_permissions rp set can_access = false
  from public.roles_config rc
 where rc.id = rp.role_id and rc.name = 'pos_b924985f7e15437fb7c8a4bb827e667c'
   and rp.module = 'Administración' and rp.submodule = 'Usuarios';
-- 3) Posiciones sin nadie: se borran.
delete from public.posiciones_borrador pb
 where pb.nombre in ('Agente + Comunicación', 'Gestión de personas')
   and not exists (select 1 from public.posiciones_borrador_personas a where a.posicion_id = pb.id);
-- 4) pendientes_de_gestion(): los horarios solo se piden a quien debe estar en
--    Cowork (ver la versión completa aplicada; mismo cuerpo que
--    20261127200000 con «and public.debe_estar_en_cowork(p.id)»).
