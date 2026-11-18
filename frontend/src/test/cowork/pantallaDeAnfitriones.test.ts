import { describe, it, expect } from "vitest";
import { leerRegla, reglaPorRol } from "@/hooks/useReglaDeAnfitrion";

// LA PANTALLA DE LOS ANFITRIONES DE COWORK (Alvaro, 18/11/2026, preguntas y
// respuestas):
//   · Supervisores: pantalla sola y obligatoria en el Hub; ahí la ven solo los
//     admins libres. Argos los trata como a un chatter.
//   · El grupo de Luis (Luis, Juan Pachas, Grace, Jackeline y Alvaro René):
//     Argos los vigila (también a los admins del grupo) pero nada es
//     obligatorio, ni cámara ni pantalla; su tiempo cuenta conectados. Si
//     prenden la cámara, Argos los juzga como a todos (segunda vuelta).
//   · Alvaro (el dueño): libre, como hoy.
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
    "/supabase/migrations/20261118080000_grupo_sin_exigencias.sql",
    "/supabase/functions/cowork-session/index.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);
const fuente = (fin: string) => Object.entries(fuentes).find(([ruta]) => ruta.endsWith(fin))?.[1] ?? "";
const tablero = fuente("CoworkHostDashboard.tsx");
const llamada = fuente("LiveKitCallView.tsx");

describe("la regla de cada anfitrión", () => {
  it("lee lo que devuelve la base", () => {
    expect(leerRegla([{ vigilado: true, pantalla_obligatoria: true, camara_obligatoria: true }]))
      .toEqual({ vigilado: true, pantallaObligatoria: true, camaraObligatoria: true });
    // El grupo de Luis: vigilado, nada obligatorio.
    expect(leerRegla([{ vigilado: true, pantalla_obligatoria: false, camara_obligatoria: false }]))
      .toEqual({ vigilado: true, pantallaObligatoria: false, camaraObligatoria: false });
    // Un libre nunca tiene nada obligatorio.
    expect(leerRegla({ vigilado: false, pantalla_obligatoria: true, camara_obligatoria: true }))
      .toEqual({ vigilado: false, pantallaObligatoria: false, camaraObligatoria: false });
  });

  it("una respuesta vacía no se toma por «libre»", () => {
    expect(leerRegla([])).toBeNull();
    expect(leerRegla(null)).toBeNull();
    expect(leerRegla([{ pantalla_obligatoria: true }])).toBeNull();
  });

  it("si la base no contesta, la regla de siempre", () => {
    expect(reglaPorRol(true)).toEqual({ vigilado: false, pantallaObligatoria: false, camaraObligatoria: false });
    expect(reglaPorRol(false)).toEqual({ vigilado: true, pantallaObligatoria: true, camaraObligatoria: true });
  });

  it("la base trae a las cinco personas del grupo de Luis, sin cámara ni pantalla obligatorias", () => {
    const base = fuente("20261118070000_reglas_de_anfitrion_cowork.sql");
    const grupo = fuente("20261118080000_grupo_sin_exigencias.sql");
    for (const id of [
      "41b35cef-82a8-4991-9234-3514b0064767", // Luis Carlos Ortega
      "75bca8d9-ded5-4e86-b591-88209f6a5e6c", // Juan Pachas
      "8b90f141-8546-4cfd-a358-56ff227623df", // Grace Gelves
      "69d693c9-8620-4549-9c2f-3436b484bde1", // Jackeline Mejía
      "fcdfdfcb-c0ab-4c82-b6d9-d50d37ab086e", // Alvaro René
    ]) expect(grupo).toContain(id);
    // El dueño no está: sigue libre.
    expect(grupo).not.toContain("528453bd-f1e1-43d3-85c1-01c5fa5bbcfb");
    expect(grupo).toMatch(/select u\.id, false, false, v\.vigilar, v\.nota/);
    expect(base).toMatch(/create or replace function public\.argos_vigila_a/);
    expect(base).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/);
    // Las pantallas del Hub las ven los admins por rol (René también).
    expect(grupo).toMatch(/where public\.is_in_role_group\(ur\.user_id, 'admin'\);/);
  });

  it("el reloj del anfitrión exige lo que dice la base", () => {
    expect(fuente("cowork-session/index.ts")).toContain(
      "exige = { camara: regla.camara_obligatoria !== false, pantalla: regla.pantalla_obligatoria !== false };");
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
    expect(tablero).toContain("camaraOpcional: vigilarAnfitrion && !camaraObligatoria,");
  });
});

describe("la llamada", () => {
  it("con la pantalla opcional no se comparte sola", () => {
    expect(llamada).toContain("const pantallaSola = !!supervisorEncuadre && !pantallaOpcional && !hideScreenShare");
  });

  it("con la pantalla opcional, Argos no la reclama ni la anota", () => {
    expect(llamada).toContain("useScreenShareNudge(localScreenShare, !!supervisorEncuadre && conSalaViva && !pantallaOpcional);");
    expect(llamada).toContain("compartiendo: pantallaOpcional ? true : localScreenShare,");
  });

  it("con la cámara opcional, Argos trabaja solo con la cámara prendida", () => {
    expect(llamada).toContain("const argosConCamara = !camaraOpcional || camaraRealOn;");
    expect(llamada).toContain("useFaceNudge(supervisorEncuadre && conSalaViva && argosConCamara ? faceWatch : null);");
    expect(llamada.match(/activo: !!supervisorEncuadre && conSalaViva && argosConCamara,/g)?.length).toBe(2);
    expect(llamada).toContain("activo: !!supervisorEncuadre && argosConCamara,");
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
