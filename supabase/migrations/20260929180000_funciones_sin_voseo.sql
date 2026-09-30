-- Español neutro en los mensajes que las funciones vivas le muestran a la gente.
-- Se reescribe cada función desde su propia definición actual (pg_get_functiondef),
-- cambiando solo el texto: la lógica, los permisos y los grants quedan igual.
DO $$
DECLARE
  cambios text[][] := ARRAY[
    ['api_keys_actua_como_inmutable',       'creá otra',                     'crea otra'],
    ['api_keys_reglas_messenger',           'creá otra',                     'crea otra'],
    ['create_recruitment_deal_for_contact', 'usá la venta de plataforma',    'usa la venta de plataforma'],
    ['drive_items_cuidar',                  'No podés guardar',              'No puedes guardar'],
    ['drive_uso',                           'No podés ver el uso',           'No puedes ver el uso'],
    ['get_lead_outcomes_de_origen',         'sin fila acá',                  'sin fila aquí'],
    ['parrilla_guard_enviada',              'volvé a borrador',              'vuelve a borrador'],
    ['recordar_horarios_pendientes',        'Respondan por acá',             'Respondan por aquí'],
    ['recover_stuck_spammer_scans',         'Hacé click en',                 'Haz clic en'],
    ['wa_conversation_set_assignees',       'No tenés permiso',              'No tienes permiso']
  ];
  i int;
  f record;
  def text;
  nuevo text;
BEGIN
  FOR i IN 1 .. array_length(cambios, 1) LOOP
    FOR f IN
      SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = cambios[i][1]
    LOOP
      def := pg_get_functiondef(f.oid);
      nuevo := replace(def, cambios[i][2], cambios[i][3]);
      IF nuevo = def THEN
        RAISE EXCEPTION 'No se encontró «%» en %', cambios[i][2], cambios[i][1];
      END IF;
      EXECUTE nuevo;
    END LOOP;
  END LOOP;
END $$;
