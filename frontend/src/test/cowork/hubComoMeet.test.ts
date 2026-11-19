// EL SUPERVISOR HUB COMO GOOGLE MEET (Alvaro, 18/11/2026). Problemas que él ve
// al entrar al Hub: los supervisores no comparten, la pantalla se ve mal (o en
// NEGRO), no se enteran de los avisos y se salen o se caen sin que nadie le
// avise. Una guarda por regla.
import { describe, it, expect, vi } from "vitest";
import { ScreenSharePresets } from "livekit-client";
import {
  CAPTURA_COWORK, CAPTURA_HUB, PUBLICACION_DE_PANTALLA, PUBLICACION_DE_PANTALLA_COWORK, PUBLICACION_DE_PANTALLA_HUB,
  PUBLICACION_DE_PANTALLA_LIVIANA, esSalaDelHub, opcionesDePantalla, pantallaDeTrabajoCowork,
} from "@/lib/perfilDePantalla";
import { cuadroEsNegro, juezDePantallaNegra, MUESTRAS_NEGRAS } from "@/lib/pantallaNegra";
import { estadoDePantallaDelHub } from "@/lib/senalDelHub";
import { columnasDelMosaico, pantallasParaMosaico, textoDePantallaDelHub } from "@/lib/hubComoMeet";
import { claveDeEstadoDelHub, leerEstadoDelHub, CAUSAS_DEL_HUB } from "@/lib/estadoSupervisoresHub";
import { clasificarFalloDePantalla, pantallaSinPermiso } from "@/lib/fallosDePantalla";
import type { LKParticipant } from "@/hooks/useLiveKit";
import { cowork } from "@/lib/i18n/cowork";

type Glob = (p: string, o: Record<string, unknown>) => Record<string, string>;
const llamada = Object.values((import.meta as unknown as { glob: Glob }).glob("/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const tablero = Object.values((import.meta as unknown as { glob: Glob }).glob("/frontend/src/pages/cowork/CoworkHostDashboard.tsx", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const livekit = Object.values((import.meta as unknown as { glob: Glob }).glob("/frontend/src/hooks/useLiveKit.ts", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const migracion = Object.values((import.meta as unknown as { glob: Glob }).glob("/supabase/migrations/20261119010000_hub_supervisores_senal_y_avisos.sql", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const estadoChip = Object.values((import.meta as unknown as { glob: Glob }).glob("/frontend/src/pages/cowork/EstadoSupervisoresHub.tsx", { query: "?raw", import: "default", eager: true }))[0] ?? "";
const avisosHub = Object.values((import.meta as unknown as { glob: Glob }).glob("/frontend/src/pages/cowork/AvisosEnElHub.tsx", { query: "?raw", import: "default", eager: true }))[0] ?? "";

const p = (o: Partial<LKParticipant>): LKParticipant => ({
  sid: "s", identity: "u", name: "U", isSpeaking: false, isMuted: true, isCameraOff: true, isScreenSharing: false,
  isLocal: false, handRaised: false, reactions: [], connectionQuality: "good" as LKParticipant["connectionQuality"], hasVideoTrack: true, ...o,
});

describe("2. la pantalla del Hub como Meet: nítida y fluida", () => {
  it("1080p a 15 fps, 2,5 Mbps, mantiene la resolución y cuida el detalle", () => {
    expect(PUBLICACION_DE_PANTALLA_HUB.screenShareEncoding).toEqual({ maxBitrate: 2_500_000, maxFramerate: 15 });
    expect(PUBLICACION_DE_PANTALLA_HUB.degradationPreference).toBe("maintain-resolution");
    expect(CAPTURA_HUB.resolution).toEqual({ width: 1920, height: 1080, frameRate: 15 });
    expect(CAPTURA_HUB.contentHint).toBe("detail");
  });
  it("con capa chica para el mosaico (no se apaga el simulcast)", () => {
    expect(PUBLICACION_DE_PANTALLA_HUB.simulcast).not.toBe(false);
    expect(PUBLICACION_DE_PANTALLA_HUB.screenShareSimulcastLayers).toEqual([ScreenSharePresets.h720fps5]);
  });
  it("solo en el Hub: las salas de los chatters siguen a 5 fps y las llamadas comunes igual", () => {
    expect(esSalaDelHub("cowork_hub_a6bae2d8")).toBe(true);
    expect(esSalaDelHub("cowork_a6bae2d8_7")).toBe(false);
    expect(esSalaDelHub("call-123")).toBe(false);
    const base = { audio: false };
    expect(opcionesDePantalla("normal", base, true, false).publicacion).toBe(PUBLICACION_DE_PANTALLA_COWORK);
    expect(opcionesDePantalla("normal", base, true, false).captura.resolution).toEqual(CAPTURA_COWORK.resolution);
    expect(opcionesDePantalla("normal", base, false, false).publicacion).toBe(PUBLICACION_DE_PANTALLA);
    expect(opcionesDePantalla("normal", base, pantallaDeTrabajoCowork("cowork_hub_x"), esSalaDelHub("cowork_hub_x")).publicacion).toBe(PUBLICACION_DE_PANTALLA_HUB);
  });
  it("con la subida floja manda el perfil liviano también en el Hub", () => {
    expect(opcionesDePantalla("liviano", { audio: false }, false, true).publicacion).toBe(PUBLICACION_DE_PANTALLA_LIVIANA);
  });
  it("useLiveKit pide el perfil del Hub por el nombre de la sala", () => {
    expect(livekit).toContain("esSalaDelHub(room.name)");
  });
});

describe("1. pantalla en NEGRO = no compartir", () => {
  it("un cuadro negro se reconoce; con una sola letra clara, no", () => {
    const negro = new Uint8ClampedArray(64 * 36 * 4);
    for (let i = 3; i < negro.length; i += 4) negro[i] = 255;
    expect(cuadroEsNegro(negro)).toBe(true);
    const conLetra = negro.slice();
    conLetra[400] = 200;
    expect(cuadroEsNegro(conLetra)).toBe(false);
  });
  it("hacen falta varias muestras negras seguidas; una con imagen lo borra", () => {
    const cambios = vi.fn();
    const juez = juezDePantallaNegra(cambios);
    for (let i = 0; i < MUESTRAS_NEGRAS - 1; i++) juez(true);
    expect(cambios).not.toHaveBeenCalled();
    juez(true);
    expect(cambios).toHaveBeenLastCalledWith(true);
    juez(false);
    expect(cambios).toHaveBeenLastCalledWith(false);
  });
  it("una pantalla nueva que sigue negra no borra la marca mientras se mide", () => {
    const cambios = vi.fn();
    const juez = juezDePantallaNegra(cambios);
    juez(true);
    expect(cambios).not.toHaveBeenCalled();
  });
  it("negra gana a «compartiendo» en la señal al dueño", () => {
    expect(estadoDePantallaDelHub({ compartiendo: true, negra: true, apagadaAMano: false, fallo: null })).toBe("negra");
    expect(estadoDePantallaDelHub({ compartiendo: true, negra: false, apagadaAMano: false, fallo: null })).toBe("compartiendo");
    expect(estadoDePantallaDelHub({ compartiendo: false, negra: false, apagadaAMano: true, fallo: null })).toBe("apagada");
    expect(estadoDePantallaDelHub({ compartiendo: false, negra: false, apagadaAMano: false, fallo: "permiso" })).toBe("permiso");
    expect(estadoDePantallaDelHub({ compartiendo: false, negra: false, apagadaAMano: false, fallo: "falla" })).toBe("falla");
    expect(estadoDePantallaDelHub({ compartiendo: false, negra: false, apagadaAMano: false, fallo: null })).toBe("sin_pedir");
  });
  it("al quedar negra se corta y la app la vuelve a pedir con espera creciente", () => {
    expect(llamada).toMatch(/alQuedarNegra: \(\) => \{[\s\S]*?st\.fallos \+= 1;[\s\S]*?toggleScreenShare\(\)/);
    expect(llamada).toContain("if (l.isScreenSharing) { if (!pantallaNegraRef.current) st.fallos = 0; return; }");
  });
  it("el permiso negado del computador se distingue de otra falla", () => {
    expect(clasificarFalloDePantalla({ name: "NotAllowedError" })).toBe("permiso");
    expect(clasificarFalloDePantalla(new Error("Permission denied by system"))).toBe("permiso");
    expect(clasificarFalloDePantalla(new Error("Could not start video source"))).toBe("falla");
  });
});

describe("el recuadro negro del que no tiene permiso", () => {
  it("una pantalla que LiveKit no me deja ver no arma recuadro", () => {
    expect(pantallaSinPermiso({ permissionStatus: "not_allowed" })).toBe(true);
    expect(pantallaSinPermiso({ permissionStatus: "allowed" })).toBe(false);
    expect(pantallaSinPermiso(undefined)).toBe(false);
    expect(livekit).toContain("if (pantallaSinPermiso(screenPub))");
    expect(livekit).toContain("RoomEvent.TrackSubscriptionPermissionChanged, debouncedRefresh");
  });
});

describe("1 y 3. la pantalla sola al entrar; quitarla a mano se respeta pero cuenta", () => {
  it("el Hub del supervisor vigilado manda su señal y respeta el apagado a mano", () => {
    expect(tablero).toContain("hubDelSupervisor: vigilarAnfitrion && cowork.session?.id ? { sessionId: cowork.session.id } : null");
    expect(llamada).toContain("if (apagadaAManoRef.current) return;");
    expect(llamada).toContain("onToggleScreenShare={salaCaida ? primeroReconectar : alternarPantallaDesdeBoton}");
    // Solo en el Hub: en las salas de los chatters, el botón no marca nada.
    expect(llamada).toContain("if (enHubVigilado) setPantallaApagadaAMano(l.isScreenSharing);");
  });
  it("el supervisor ve un aviso grande con la causa y el botón de compartir", () => {
    expect(textoDePantallaDelHub({ negra: true, apagadaAMano: false, fallo: null, enLaApp: true }).titulo).toBe("cowork.hubPantalla.negraTitulo");
    expect(textoDePantallaDelHub({ negra: false, apagadaAMano: true, fallo: null, enLaApp: true }).titulo).toBe("cowork.hubPantalla.apagadaTitulo");
    expect(textoDePantallaDelHub({ negra: false, apagadaAMano: false, fallo: "permiso", enLaApp: true }).titulo).toBe("cowork.hubPantalla.permisoTitulo");
    expect(textoDePantallaDelHub({ negra: false, apagadaAMano: false, fallo: null, enLaApp: false }).detalle).toBe("cowork.hubPantalla.navegadorDetalle");
    for (const k of ["compartir", "sinPantallaTitulo", "reintentandoDetalle", "navegadorDetalle", "apagadaTitulo", "apagadaDetalle", "negraTitulo", "negraDetalle", "permisoTitulo", "permisoDetalle", "agrandar", "verTodas"]) {
      expect(cowork).toHaveProperty([`cowork.hubPantalla.${k}`]);
    }
    expect(llamada).toContain('{t("cowork.hubPantalla.compartir")}');
  });
});

describe("3. ver como Meet: mosaico y clic para agrandar", () => {
  const pantallas = [p({ sid: "a-screen", isScreenSharing: true }), p({ sid: "b-screen", isScreenSharing: true })];
  it("con dos o más pantallas ajenas, mosaico", () => {
    expect(pantallasParaMosaico(pantallas, { activo: true, fijado: null, compacto: false })?.length).toBe(2);
  });
  it("con una sola, fijada, en la ventanita o fuera del Hub, la vista de siempre", () => {
    expect(pantallasParaMosaico(pantallas.slice(0, 1), { activo: true, fijado: null, compacto: false })).toBeNull();
    expect(pantallasParaMosaico(pantallas, { activo: true, fijado: "a-screen", compacto: false })).toBeNull();
    expect(pantallasParaMosaico(pantallas, { activo: true, fijado: null, compacto: true })).toBeNull();
    expect(pantallasParaMosaico(pantallas, { activo: false, fijado: null, compacto: false })).toBeNull();
    expect(pantallasParaMosaico([...pantallas.slice(0, 1), p({ isScreenSharing: true, isLocal: true })], { activo: true, fijado: null, compacto: false })).toBeNull();
  });
  it("las columnas crecen con la cantidad", () => {
    expect(columnasDelMosaico(2)).toContain("md:grid-cols-2");
    expect(columnasDelMosaico(4)).toBe("grid-cols-2");
    expect(columnasDelMosaico(6)).toContain("md:grid-cols-3");
  });
  it("el clic agranda (fija) y se puede volver a ver todas", () => {
    expect(llamada).toContain("handlePinParticipant(p.sid)");
    expect(llamada).toContain('t("cowork.hubPantalla.verTodas")');
    expect(tablero).toContain("mosaicoDePantallas: veHubComoDueno");
    expect(tablero).toContain("const veHubComoDueno = regla !== null && !regla.vigilado;");
  });
});

describe("4. los avisos llegan al supervisor dentro del Hub", () => {
  it("el Hub recibe los avisos, fijos y trayendo la app al frente", () => {
    expect(tablero).toContain("<AvisosEnElHub userId={userId} />");
    expect(avisosHub).toContain("useRecepcionAvisos(userId, { fijo: true, alLlegar: alFrente })");
    expect(avisosHub).toContain("mostrarEstaVentana");
  });
  it("sin escucharlos dos veces: el tablero solo si el Hub no está", () => {
    expect(tablero).toContain("useRecepcionAvisos(hubConnected ? null : userId)");
  });
});

describe("4. el dueño se entera, con la causa", () => {
  it("la base avisa a los 2 minutos, una vez por episodio, por destinatarios_de_aviso", () => {
    expect(migracion).toContain("a.desde <= v_ahora - interval '2 minutes'");
    expect(migracion).toContain("from public.destinatarios_de_aviso(r.user_id) d");
    expect(migracion).toContain("on hub_alertas (user_id, problema) where hasta is null".replace("on hub_alertas", "on public.hub_alertas"));
    expect(migracion).toContain("cron.schedule('vigia-supervisores-hub', '* * * * *'");
  });
  it("cuenta fuera, sin cámara, sin pantalla y la llamada caída que no se rinde", () => {
    expect(migracion).toContain("where sup.viva and sup.en_hub and sup.conexion in ('desconectada', 'dormido')");
    expect(migracion).toMatch(/'camara', 'camara_apagada'/);
    expect(migracion).toContain("when 'negra' then 'pantalla_negra'");
  });
  it("cada causa tiene su texto en el aviso y en el chip", () => {
    for (const c of CAUSAS_DEL_HUB) {
      expect(migracion).toContain(`when '${c}' then`);
      expect(cowork).toHaveProperty([`cowork.hubEstado.${c}`]);
    }
  });
  it("el chip: problemas primero, y un fallo no es «todos bien»", () => {
    const filas = leerEstadoDelHub([
      { user_id: "1", nombre: "Ana Pérez Gómez", problema: "ok", causa: null, desde: null, texto: null },
      { user_id: "2", nombre: "Beto", problema: "pantalla", causa: "pantalla_negra", desde: "2026-11-18T20:00:00Z", texto: "x" },
      { user_id: "3", nombre: "Raro", problema: "inventado" },
    ]);
    expect(filas.map((f) => f.userId)).toEqual(["2", "1"]);
    expect(filas[1].nombre).toBe("Ana Pérez");
    expect(claveDeEstadoDelHub(filas[0])).toBe("cowork.hubEstado.pantallaNegra");
    expect(() => leerEstadoDelHub(null)).toThrow();
    expect(estadoChip).toContain('t("cowork.hubEstado.error")');
  });
});
