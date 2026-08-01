-- Scoping explícito de la BANDEJA de WhatsApp por bot.
--
-- PROBLEMA: get_department_conversations resolvía la línea a leer con
--   args.department ?? ctx.department
-- es decir, el MODELO podía pasar cualquier departamento y saltarse el del bot.
-- La descripción de la tool incluso lo invitaba ("pasa `department` para otro").
-- Resultado: el bot de Managers podía leer la bandeja de closers y al revés.
--
-- POR QUÉ NO ALCANZA CON "el department del bot manda": no hay líneas `sales`.
-- Las únicas wa_channels son `closer` (Unlimited, Unlok) y `manager`. El bot de
-- Ventas/Marketing tiene department='sales' y necesita leer la línea de CLOSERS
-- (M/V es el grupo de closers). Atarlo a su propio department le cortaría la
-- bandeja por completo. Por eso el permiso va explícito y no derivado.
--
-- NULL = sin fila declarada ⇒ el handler cae al department del bot (comportamiento
-- conservador de siempre). Array vacío = ese bot NO lee bandeja.
ALTER TABLE wa_bots
  ADD COLUMN IF NOT EXISTS inbox_departments jsonb;

COMMENT ON COLUMN wa_bots.inbox_departments IS
  'Departamentos de wa_channels que este bot puede leer con get_department_conversations. '
  'NULL = solo su propio department. [] = no lee bandeja. El modelo NO puede salirse de esta lista.';

-- Managers: solo lo suyo (pedido explícito del owner 01/08).
UPDATE wa_bots SET inbox_departments = '["manager"]'::jsonb WHERE department = 'manager';

-- Ventas/Marketing: es el grupo de los closers → lee la línea de closers.
UPDATE wa_bots SET inbox_departments = '["closer"]'::jsonb WHERE department = 'sales';

-- Clari (DM del owner): Álvaro es el dueño, ve todas las líneas desde su privado.
UPDATE wa_bots SET inbox_departments = '["manager","closer"]'::jsonb WHERE department = 'private';

-- AI Warming (recruitment): no tiene línea propia ni necesita leer bandeja.
UPDATE wa_bots SET inbox_departments = '[]'::jsonb WHERE department = 'recruitment';
