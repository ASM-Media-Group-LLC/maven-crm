-- COWORK SOLO EN LA APP: VIERNES 20/11 Y PRUEBA CON 3 (Alvaro, 17/11/2026).
--
-- La fecha estaba en el lunes 24/11 (otra sesión, 9 pm). Alvaro decidió después:
-- prueba desde el 18/11 con Grace Gelves, Jackeline Mejía y Luis Roman, y para
-- todos desde el viernes 20/11 00:00 de Colombia. Los probadores ya tienen que
-- usar la app en el computador (lib/coworkSoloApp.ts → estadoSoloApp).
alter table public.monitor_config
  add column if not exists cowork_solo_app_probadores uuid[] not null default '{}';

comment on column public.monitor_config.cowork_solo_app_probadores is
  'Cowork solo en la app: a estas personas ya se les pide la app en el navegador del computador, antes de cowork_solo_app_desde.';

update public.monitor_config
   set cowork_solo_app_desde = '2026-11-20 05:00:00+00',
       cowork_solo_app_probadores = array[
         '8b90f141-8546-4cfd-a358-56ff227623df', -- Grace Gelves
         '69d693c9-8620-4549-9c2f-3436b484bde1', -- Jackeline Mejía
         '41b35cef-82a8-4991-9234-3514b0064767'  -- Luis Roman
       ]::uuid[]
 where id = 1;
