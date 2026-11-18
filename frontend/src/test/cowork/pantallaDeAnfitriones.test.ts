import { describe, it, expect } from "vitest";
import { leerRegla, reglaPorRol } from "@/hooks/useReglaDeAnfitrion";

// LA PANTALLA DE LOS ANFITRIONES DE COWORK (Alvaro, 18/11/2026, preguntas y
// respuestas):
//   · Supervisores: pantalla sola y obligatoria en el Hub; ahí la ven solo los
//     admins libres. Argos los trata como a un chatter.
//   · Luis, Juan Pachas, Grace y Jackeline: Argos los vigila (Grace y Jackeline
//     aunque son admins) pero la pantalla del Hub no es obligatoria; si la
//     comparten y la quitan, ahí sí cuenta.
//   · Alvaro y Alvaro René: como hoy.
//   · Todos los anfitriones muestran su pantalla en una, varias o todas las salas
//     (con la del Hub, sin pedir otra); al meterse en una sala se apaga en las
//     demás; adentro de la sala, «Mostrar mi pantalla». «Hablar» manda solo voz.
//
// Las fuentes se leen con import.meta.glob (ruta y opciones literales): el
// tsconfig de la app no trae los tipos de Node.

type Glob = { glob: (p: string | string[], o: Record<string, unknown>) => Record<string, string> };
const fuentes = (import.meta as unknown as Glob).glob(
  [
    "/frontend/src/pages/cowork/CoworkHostDashboard.tsx",
    "/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx",
    "/frontend/src/hooks/useMonitorEstado.ts",
    "/supabase/functions/monitor-vision/index.ts",
    "/supabase/migrations/20261118070000_reglas_de_anfitrion_cowork.sql",
  ],
  { query: "?raw", import: "default", eager: true },
);
const fuente = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";
const tablero = fuente("CoworkHostDashboard.tsx");
const llamada = fuente("LiveKitCallView.tsx");

describe("la regla de cada anfitrión", () => {
  it("lee lo que devuelve la base", () => {
    expect(leerRegla([{ vigilado: true, pantalla_obligatoria: true }])).toEqual({ vigilado: true, pantallaObligatoria: true });
    expect(leerRegla([{ vigilado: true, pantalla_obligatoria: false }])).toEqual({ vigilado: true, pantallaObligatoria: false });
    // Un libre nunca tiene pantalla obligatoria.
    expect(leerRegla({ vigilado: false, pantalla_obligatoria: true })).toEqual({ vigilado: false, pantallaObligatoria: false });
  });

  it("una respuesta vacía no se toma por «libre»", () => {
    expect(leerRegla([])).toBeNull();
    expect(leerRegla(null)).toBeNull();
    expect(leerRegla([{ pantalla_obligatoria: true }])).toBeNull();
  });

  it("si la base no contesta, la regla de siempre", () => {
    expect(reglaPorRol(true)).toEqual({ vigilado: false, pantallaObligatoria: false });
    expect(reglaPorRol(false)).toEqual({ vigilado: true, pantallaObligatoria: true });
  });

  it("la base trae a las cuatro personas «como Luis»", () => {
    const sql = fuente("20261118070000_reglas_de_anfitrion_cowork.sql");
    for (const id of [
      "41b35cef-82a8-4991-9234-3514b0064767", // Luis Carlos Ortega
      "75bca8d9-ded5-4e86-b591-88209f6a5e6c", // Juan Pachas
      "8b90f141-8546-4cfd-a358-56ff227623df", // Grace Gelves
      "69d693c9-8620-4549-9c2f-3436b484bde1", // Jackeline Mejía
    ]) expect(sql).toContain(id);
    expect(sql).toMatch(/create or replace function public\.argos_vigila_a/);
    expect(sql).toMatch(/create or replace function public\.cowork_ven_pantallas_del_hub/);
    expect(sql).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/);
  });
});

describe("el tablero del anfitrión", () => {
  it("la vigilancia sale de la base, no solo del rol", () => {
    expect(tablero).toContain("const regla = useReglaDeAnfitrion(miRol !== null, isAdmin);");
    expect(tablero).not.toContain("const vigilarAnfitrion = miRol !== null && !isAdmin;");
  });

  it("una, varias o todas las salas: el botón de cada sala no apaga las otras", () => {
    expect(tablero).toContain("onClick={() => setRoomScreen((m) => ({ ...m, [room.id]: !(m[room.id] ?? false) }))}");
    expect(tablero).not.toContain("unaSolaPantalla");
    expect(tablero).toMatch(/onClick=\{\(\) => fijarScreenDeTodas\(!pantallaATodas\)\}/);
  });

  it("al meterse en una sala, la pantalla se apaga en las demás", () => {
    expect(tablero).toContain("if (usaPantallaDelHub) setRoomScreen((m) => ((m[roomId] ?? false) ? { [roomId]: true } : {}));");
  });

  it("adentro de la sala: «Mostrar mi pantalla» publica la del Hub, sin pedir otra", () => {
    expect(tablero).toContain('t("cowork.host.room.mostrarPantalla")');
    expect(tablero).toContain("pantallaPrestada={usaPantallaDelHub && !activeMeetId && activeRoomId && screenFor(activeRoomId) ? baseDePantalla : null}");
  });

  it("al supervisor con la pantalla del Hub obligatoria no se le abre otra captura", () => {
    expect(tablero).toContain("const capturaAparte = !usaPantallaDelHub || (!pantallaHub && !pantallaObligatoria);");
    expect(tablero).toContain("if (!screenArmed || !capturaAparte) return;");
  });

  it("en el Hub la pantalla del vigilado la ven solo los admins libres", () => {
    expect(tablero).toContain("pantallaVisiblePara: venPantallasDelHub,");
    expect(tablero).toContain("pantallaOpcional: vigilarAnfitrion && !pantallaObligatoria,");
  });
});

describe("la llamada", () => {
  it("con la pantalla opcional no se comparte sola", () => {
    expect(llamada).toContain("const pantallaSola = !!supervisorEncuadre && !pantallaOpcional && !hideScreenShare");
  });

  it("con la pantalla opcional, Argos la reclama solo después de compartirla una vez", () => {
    expect(llamada).toContain("useScreenShareNudge(localScreenShare, !!supervisorEncuadre && conSalaViva && (!pantallaOpcional || yaCompartioPantalla));");
  });

  it("los que pueden ver la pantalla del Hub reciben todo", () => {
    expect(llamada).toContain('venla.has(rp.identity.split("__")[0])');
  });

  it("la pantalla prestada se publica como clon y se retira al salir", () => {
    expect(llamada).toContain("const clon = pantallaPrestada.clone();");
    expect(llamada).toContain("room.localParticipant.publishTrack(clon, { source: Track.Source.ScreenShare })");
    expect(llamada).toContain("room.localParticipant.unpublishTrack(clon, true);");
  });
});

describe("Argos vigila según la base", () => {
  it("el monitor de cámara (cliente y edge) usa argos_vigila_a", () => {
    expect(fuente("useMonitorEstado.ts")).toContain('rpc("argos_vigila_a", { _uid: user.id })');
    expect(fuente("monitor-vision/index.ts")).toContain('admin.rpc("argos_vigila_a", { _uid: user.id })');
  });
});
