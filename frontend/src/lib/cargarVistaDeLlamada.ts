// Importación diferida, compartida por la llamada persistente y sus reintentos.
// Mantenerla fuera del componente permite comprobar cortes de red sin iniciar
// una llamada ni acceder a cámara o micrófono en las pruebas.
export function cargarVistaDeLlamada() {
  return import("@/pages/messenger/videocall/LiveKitCallView");
}
