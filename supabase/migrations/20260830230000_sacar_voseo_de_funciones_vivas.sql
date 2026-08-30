-- Quedaban cinco funciones VIVAS con voseo. Tres de ellas son errores que ve el
-- usuario ("No tenés permiso…"), y dos son texto que el bot le lee al equipo.
--
-- LA LECCIÓN: la purga de voseo (#1452/#1453) tocó el código del repositorio,
-- pero las migraciones son historia YA APLICADA — reescribirlas no cambia nada
-- en producción. Lo que manda es el cuerpo de la función viva, y ahí seguía.
-- Para auditar esto no sirve grepear el repo: hay que preguntarle a la base.
--
-- Se reescribe cada función a partir de SU PROPIA definición, cambiando solo las
-- cadenas. Así el cuerpo queda idéntico al que ya estaba y no hay ocasión de
-- introducir un error copiando código a mano.
do $do$
declare
  r record;
  nuevo text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('assign_closer_to_contact', 'get_creator_top_fans',
                        'get_manager_growth_feed', 'tg_conversation_set_assignees',
                        'wa_conversation_set_assignees')
  loop
    nuevo := pg_get_functiondef(r.oid);
    nuevo := replace(nuevo, 'No tenés permiso', 'No tienes permiso');
    nuevo := replace(nuevo, 'Decí SIEMPRE de qué período hablás', 'Di SIEMPRE de qué período hablas');
    nuevo := replace(nuevo, 'aclará que los montos', 'aclara que los montos');
    nuevo := replace(nuevo, 'revisá la calidad EN ESAS REDES', 'revisa la calidad EN ESAS REDES');
    execute nuevo;
  end loop;
end
$do$;
