// La autorización del puesto se verifica antes de firmar tokens o mutar sesiones.
type Base = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error: unknown}> };
const salida = new Set(["leaveRoom", "leaveSession", "incognitoLeave", "salirDeMeetGrupal", "endBreak", "pausaAbierta"]);
const anfitrion = new Set(["asignarSala", "barrerAsignacionesColgadas", "crearMeetGrupal", "terminarMeetGrupal", "approveScreenShare", "endSession", "getHostCode", "addRoom", "updateSession", "setAlertRules", "updateRoom", "closeRoom", "ackHostRequest", "resolveHostRequest"]);
export async function revisarPosicion(db: Base, uid: string, action: string, body: Record<string, unknown>): Promise<{ok:true}|{ok:false;status:403|503;error:string}> {
  if (salida.has(action)) return {ok:true};
  const claves = new Set(["Cowork|*"]);
  if (anfitrion.has(action) || (action === "joinSession" && body.role === "host") || (action === "issueLiveKitToken" && body.purpose === "join_host_hub")) claves.add("N:cowork.abrir");
  const supervisa = action === "issueLiveKitToken" && ["preview_room", "monitor_room", "incognito_room"].includes(String(body.purpose));
  if (supervisa || action === "incognitoPing") claves.add("N:cowork.verpantallas");
  for (const clave of claves) {
    const {data,error} = await db.rpc("posicion_decision", {_uid:uid,_clave:clave});
    if (error || (data !== true && data !== false && data !== null)) return {ok:false,status:503,error:"No se pudo verificar el permiso de tu posición"};
    if (data === false) return {ok:false,status:403,error:"Tu posición no permite esta función de Cowork"};
  }
  if (supervisa) {
    const {data,error} = await db.rpc("cowork_posicion_ver_sala", {_session:body.sessionId,_room:body.roomId});
    if (error || (data !== true && data !== false && data !== null)) return {ok:false,status:503,error:"No se pudo verificar el alcance de tu posición"};
    if (data === false) return {ok:false,status:403,error:"Esta sala está fuera de tu alcance de supervisión"};
  }
  return {ok:true};
}
