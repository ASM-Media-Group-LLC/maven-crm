-- Baja de Miguel García (e54ccc2a-...) en la configuración de los bots.
-- Ya figuraba active=false en whatsapp_members; faltaba todo lo demás.
--
-- Criterio: se decide regla por regla, no se apaga todo lo que contenga el nombre.
-- Hay dos clases de mención y solo una es "viva":
--   · VIVA: ruteo, recordatorios, "el closer a medir es Miguel", su objetivo del
--     cierre, la lista de nombres del equipo → cambian.
--   · EJEMPLO HISTÓRICO: "el 21/08 Miguel pegó un link y el bot inventó lara_rae"
--     → enseña una regla y el nombre es incidental. Se quedan: borrarlas pierde la
--     lección, y el bot no va a dirigirse a alguien porque un ejemplo lo nombre.
update public.whatsapp_bot_rules
   set active = false, deactivated_at = now()
 where id in (
   '0e5c092f-dc40-4a28-b366-8a698ec98c49',  -- ruteo: le daba Unlimited/socios
   '60a254f7-811d-4699-af6d-00dba7fcf372',  -- "Miguel reporta el Telegram de Brian"
   '548efe19-3132-43d0-87f2-15fc14831559',  -- excepción OnlyTop "por el canal de Miguel"
   '8a370836-3263-428e-ab9e-0870c8fa8945'   -- itinerario duplicado de b9e52e01
 );

update public.whatsapp_bot_rules
   set rule_text = replace(rule_text, '(Miguel, María, Juan, Luis)', '(María, Juan, Luis)')
 where id = 'b9e52e01-7c42-4a79-b6e3-bfef74fe3c76';

insert into public.whatsapp_bot_rules (group_id, rule_text, active, created_by_user_id)
values ('d12ec56f-b324-4369-b72d-7540fb930ef6',
  'Division de canales en Marketing/Ventas (actualizada 28/08, baja de Miguel): Juan trabaja SOLO agencias B2B. Maria trabaja Kash (modelos). ⚠️ La linea de UNLIMITED / socios estrategicos, que llevaba Miguel, quedo SIN DUEÑO: si entra algo de Unlimited NO se lo asignes a nadie por tu cuenta ni lo dejes pasar — decilo en el grupo y pedi que Alvaro defina quien lo toma. Cada uno recibe alertas solo de su canal.',
  true, 'c5b124cb-f272-458d-aa8e-1b11de0ff4d6');

update public.whatsapp_reminders
   set status = 'cancelled', error = 'Miguel ya no trabaja en la empresa — cancelado 28/08/2026'
 where status in ('pending','scheduled') and body ilike '%miguel%';

update public.whatsapp_person_facts set active = false
 where active and (subject_user_id = 'e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c' or fact ilike '%miguel%');

delete from public.corte_objetivos where profile_id = 'e54ccc2a-ee51-4f9d-bc1d-7e981a015f5c';

update public.wa_bots
   set manual_prompt = manual_prompt || E'\n\n⚠️ BAJA (28/08/2026): Miguel Garcia ya NO trabaja en la empresa. No lo menciones como closer activo, no le pidas reportes ni lo incluyas en rankings, agendas ni notas. Si aparece en datos historicos, tratalo como pasado.'
 where id = '7ab51539-5388-47e1-ba0a-bd8b78cbdebb'
   and manual_prompt not ilike '%BAJA (28/08/2026)%';
