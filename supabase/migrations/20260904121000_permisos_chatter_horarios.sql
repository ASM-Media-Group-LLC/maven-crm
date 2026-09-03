-- El rol Chatter no veia "Chatters · Horarios" en el menu: el item se gatea
-- por el permiso Chatters/Horarios y el rol no tenia la fila. El Chatter
-- Supervisor recibe ademas "Horarios · Gestionar" y Rendimiento.
insert into public.role_permissions (role_id, module, submodule, can_access, data_scope)
select rc.id, 'Chatters', v.sub, v.acc, case when rc.name = 'Chatter' then 'self' else 'all' end
from public.roles_config rc
join (values ('Chatter', 'Horarios', true),
             ('Chatter Supervisor', 'Horarios', true),
             ('Chatter Supervisor', 'Horarios · Gestionar', true),
             ('Chatter Supervisor', 'Rendimiento', true)) v(rol, sub, acc) on v.rol = rc.name
where not exists (select 1 from public.role_permissions rp
                  where rp.role_id = rc.id and rp.module = 'Chatters' and rp.submodule = v.sub);
