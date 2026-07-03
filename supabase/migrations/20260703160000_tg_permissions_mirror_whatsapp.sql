-- Telegram debe comportarse IGUAL que WhatsApp a nivel de permisos por rol.
--
-- Bug reportado: un usuario con rol "closer" hacía clic en Telegram y lo rebotaba a
-- /dashboard. Causa: el guard <PermissionRoute module="Telegram" submodule="Bandeja">
-- llama canAccess("Telegram","Bandeja"); el rol closer tenía la fila
-- role_permissions(module='Telegram', submodule='Bandeja').can_access = FALSE mientras
-- WhatsApp/Bandeja = TRUE. Además manager/Team Leader no tenían NINGUNA fila de Telegram
-- (canAccess("Telegram") = false → ni veían el tab).
--
-- Las filas de role_permissions son datos de runtime (las escribe el modal de permisos),
-- no un seed; por eso esta migración las ESPEJA desde WhatsApp en vez de insertar valores
-- fijos. Es idempotente (UPDATE de las que difieren + INSERT de las que faltan) y solo
-- otorga Telegram donde ya existe WhatsApp — los roles sin WhatsApp quedan sin Telegram.
--
-- Mapeo de submódulos (WhatsApp → Telegram):
--   NULL (módulo)            → NULL (módulo)
--   'Bandeja'                → 'Bandeja'
--   'Asignar conversaciones' → 'Asignar conversaciones'
--   'Canales'                → 'Cuentas'
-- ('Analítica' e 'IA' de WhatsApp no tienen equivalente en Telegram todavía → se omiten.)
--
-- NOTA sobre cutover/re-seed: si role_permissions estuviera vacío al correr esta migración
-- (BD nueva), no matchea nada; los roles con módulo Telegram=true igual pasan por el
-- fallback de nivel-módulo de canAccess/has_permission. La cura definitiva de parity es
-- que el modal de permisos siembre Telegram junto a WhatsApp.

with mapping(wa_sub, tg_sub) as (
  values
    (null::text, null::text),
    ('Bandeja', 'Bandeja'),
    ('Asignar conversaciones', 'Asignar conversaciones'),
    ('Canales', 'Cuentas')
),
src as (
  select rp.role_id, m.tg_sub as submodule, rp.can_access, rp.data_scope
  from role_permissions rp
  join mapping m on m.wa_sub is not distinct from rp.submodule
  where rp.module = 'WhatsApp'
)
update role_permissions tg
set can_access = src.can_access,
    data_scope = src.data_scope
from src
where tg.module = 'Telegram'
  and tg.role_id = src.role_id
  and tg.submodule is not distinct from src.submodule
  and (tg.can_access is distinct from src.can_access
       or tg.data_scope is distinct from src.data_scope);

with mapping(wa_sub, tg_sub) as (
  values
    (null::text, null::text),
    ('Bandeja', 'Bandeja'),
    ('Asignar conversaciones', 'Asignar conversaciones'),
    ('Canales', 'Cuentas')
),
src as (
  select rp.role_id, m.tg_sub as submodule, rp.can_access, rp.data_scope
  from role_permissions rp
  join mapping m on m.wa_sub is not distinct from rp.submodule
  where rp.module = 'WhatsApp'
)
insert into role_permissions (role_id, module, submodule, can_access, data_scope)
select src.role_id, 'Telegram', src.submodule, src.can_access, src.data_scope
from src
where not exists (
  select 1 from role_permissions tg
  where tg.module = 'Telegram'
    and tg.role_id = src.role_id
    and tg.submodule is not distinct from src.submodule
);
