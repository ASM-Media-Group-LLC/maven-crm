// Los fixtures históricos del Messenger no incluyen la operación de KASH, Drive,
// Argos ni el constructor. Conservamos las funciones/políticas reales del chat
// y ejercitamos aquí su compatibilidad con personas todavía sin posiciones.
// Concesión, denegación y alcance se prueban con el constructor real en
// posiciones_acciones.mjs, posiciones_messenger_rls.mjs y posiciones_envios_conversaciones.mjs.
const AJENAS = new Set([
  '20261123033654_posiciones_aplicar_y_avisos_saldo.sql',
  '20261123034838_argos_avisos_saldo_10_5.sql',
  '20261123042735_posiciones_permisos_efectivos.sql',
  '20261123044233_posiciones_funciones_usuarios.sql',
  '20261123061204_posiciones_personas_revision.sql',
  '20261123061407_posiciones_constructor_compatibilidad.sql',
  '20261123062055_posiciones_constructor_delegado.sql',
  '20261123065122_posiciones_drive_acciones.sql',
  '20261123065843_posiciones_alcances_efectivos.sql',
  '20261123070139_posiciones_argos_acceso.sql',
  '20261123070450_posiciones_cowork_funciones.sql',
  '20261123070814_posiciones_marcas_revisadas.sql',
  '20261123123748_posiciones_retiro_retorno_incompatible.sql',
]);
const LEGADO = `create or replace function public.posicion_decision(uuid,text) returns boolean language sql stable as 'select null::boolean';\n`;
export function sqlMessengerConPosiciones(nombre: string, sql: string): string {
  if (AJENAS.has(nombre)) return '';
  if (nombre === '20261123064131_posiciones_acciones_messenger_argos.sql') {
    const funcion = sql.match(/CREATE OR REPLACE FUNCTION public\.delete_chat_message[\s\S]*?\$function\$;/);
    if (!funcion) throw Error('Falta la función de borrado real');
    return LEGADO + funcion[0];
  }
  if (nombre === '20261123064740_posiciones_messenger_crear_y_adjuntar.sql') {
    return LEGADO + sql.replace(/create policy posiciones_crear_llamada[\s\S]*?;/, '');
  }
  if (nombre === '20261123070221_posiciones_envios_y_links.sql') {
    return LEGADO + sql.slice(0, sql.indexOf('create or replace function public.puede_dar_links_subida'));
  }
  if (nombre === '20261123124105_posiciones_borrar_conversaciones.sql') return LEGADO + sql;
  return sql;
}
