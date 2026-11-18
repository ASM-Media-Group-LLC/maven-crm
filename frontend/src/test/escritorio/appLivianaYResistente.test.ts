import { describe, expect, it } from "vitest";
import { ESPERA_ENTRE_REFRESCOS_MS, TOPE_MEMORIA_MB, debeRefrescarPorMemoria, equipoFlojo } from "@/lib/appLiviana";
import { elegirPerfilDeCamara } from "@/lib/perfilDeCamara";
import { proximoIntentoDePantalla } from "@/lib/pantallaSolaEnLaApp";

// 17/11/2026 (Alvaro): «que la app tenga absolutamente todo» y «que no se vaya a
// traer las computadoras». Modo liviano en equipos de 8 GB o menos, refresco por
// memoria en un momento quieto, recuperación sola si se cuelga, y en Cowork la
// pantalla se comparte sola.
const main = Object.values(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const recuperarse = Object.values(import.meta.glob("../../../../desktop/src/recuperarse.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const preload = Object.values(import.meta.glob("../../../../desktop/src/preload.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const llamada = Object.values(import.meta.glob("../../pages/messenger/videocall/LiveKitCallView.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const raiz = Object.values(import.meta.glob("../../App.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;

const quieto = { ramAppMb: TOPE_MEMORIA_MB + 300, enLlamada: false, enPausa: false, escribiendo: false, ultimoRefresco: null, ahora: 10 * ESPERA_ENTRE_REFRESCOS_MS };

describe("modo liviano en equipos flojos", () => {
  it("8 GB o menos es flojo; 16 GB no; sin dato, no", () => {
    expect(equipoFlojo(3.9)).toBe(true);
    expect(equipoFlojo(7.8)).toBe(true);
    expect(equipoFlojo(8)).toBe(true);
    expect(equipoFlojo(15.8)).toBe(false);
    expect(equipoFlojo(null)).toBe(false);
    expect(equipoFlojo(undefined)).toBe(false);
  });
  it("en un equipo flojo la cámara propia sale en el perfil liviano", () => {
    const base = { prueba: null, ahorroActivo: false, limiteCam: null, limitePant: null };
    expect(elegirPerfilDeCamara(base)).toBe("normal");
    expect(elegirPerfilDeCamara({ ...base, equipoFlojo: true })).toBe("liviano");
  });
  it("las cámaras de los demás llegan como mucho en calidad media", () => {
    expect(llamada).toContain("modoLivianoActivo() && calidad === VideoQuality.HIGH ? VideoQuality.MEDIUM : calidad");
  });
});

describe("refresco por memoria, solo en un momento quieto", () => {
  it("pasa del tope, sin llamada y sin nada escrito → refresca", () => {
    expect(debeRefrescarPorMemoria(quieto)).toBe(true);
  });
  it("debajo del tope o sin dato → no", () => {
    expect(debeRefrescarPorMemoria({ ...quieto, ramAppMb: TOPE_MEMORIA_MB })).toBe(false);
    expect(debeRefrescarPorMemoria({ ...quieto, ramAppMb: null })).toBe(false);
  });
  it("en llamada no, salvo en pausa; escribiendo nunca", () => {
    expect(debeRefrescarPorMemoria({ ...quieto, enLlamada: true })).toBe(false);
    expect(debeRefrescarPorMemoria({ ...quieto, enLlamada: true, enPausa: true })).toBe(true);
    expect(debeRefrescarPorMemoria({ ...quieto, escribiendo: true })).toBe(false);
  });
  it("nunca en bucle: como mucho una vez cada media hora", () => {
    expect(debeRefrescarPorMemoria({ ...quieto, ultimoRefresco: quieto.ahora - 60_000 })).toBe(false);
    expect(debeRefrescarPorMemoria({ ...quieto, ultimoRefresco: quieto.ahora - ESPERA_ENTRE_REFRESCOS_MS - 1 })).toBe(true);
  });
  it("vive en la raíz de la app", () => {
    expect(raiz).toContain("<AppLiviana />");
  });
});

describe("si la app se cuelga o se queda en blanco, se recupera sola", () => {
  it("vigila la ventana: proceso muerto → recarga; congelada 20 s → se termina y recarga", () => {
    expect(main).toContain("vigilarVentana(ventana,");
    expect(recuperarse).toContain('wc.on("render-process-gone"');
    expect(recuperarse).toContain('wc.on("unresponsive"');
    expect(recuperarse).toContain("forcefullyCrashRenderer");
    expect(recuperarse).toMatch(/CONGELADA_MS = 20_000/);
  });
  it("no entra en bucle: más de 3 caídas en 5 min → espera 30 s", () => {
    expect(recuperarse).toMatch(/MAX_CAIDAS_SEGUIDAS = 3/);
    expect(recuperarse).toMatch(/ESPERA_SI_SE_REPITE_MS = 30_000/);
  });
  it("lo anotado se lee una vez desde la página", () => {
    expect(main).toContain('ipcMain.handle("maven:ultimo-cierre"');
    expect(preload).toContain('ultimoCierre: () => ipcRenderer.invoke("maven:ultimo-cierre")');
  });
});

describe("en Cowork la pantalla se comparte sola", () => {
  it("la app elige sola la pantalla principal cuando Cowork lo pide (después de revisar el permiso del Mac)", () => {
    expect(preload).toContain('pantallaAutomatica: (si) => ipcRenderer.send("maven:pantalla-auto", Boolean(si))');
    const manejador = main.slice(main.indexOf("setDisplayMediaRequestHandler"));
    expect(manejador.indexOf("pantallaPermitida()")).toBeLessThan(manejador.indexOf("if (pantallaAutomatica"));
    expect(manejador).toContain("getPrimaryDisplay().id");
  });
  it("la llamada la pide sola solo en la app, solo en Cowork y nunca en pausa", () => {
    // Desde el 18/11/2026, tampoco a quien tiene la pantalla opcional (el grupo de Luis).
    expect(llamada).toMatch(/const pantallaSola = !!supervisorEncuadre && !pantallaOpcional && !hideScreenShare && typeof appDeComputador\?\.pantallaAutomatica === "function"/);
    expect(llamada).toContain("if (estaEnPausa() || antesDePausaRef.current) return;");
  });
  it("si falla, espera 10 s, 20 s, 40 s… hasta 5 min", () => {
    expect(proximoIntentoDePantalla(1000, 0)).toBe(1000);
    expect(proximoIntentoDePantalla(1000, 1)).toBe(11_000);
    expect(proximoIntentoDePantalla(1000, 3)).toBe(41_000);
    expect(proximoIntentoDePantalla(0, 20)).toBe(5 * 60_000);
  });
});
