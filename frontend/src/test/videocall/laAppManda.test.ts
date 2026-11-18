// LA APP MANDA, EL NAVEGADOR SE APARTA SOLO (Alvaro, 17/11/2026).
//
// La gente abre la app de Maven con la pestaña del navegador todavía en la misma
// llamada de Cowork. LiveKit saca a la vieja con DUPLICATE_IDENTITY (11 el 16/11)
// y, con una recarga de por medio (la recarga sola por versión nueva al «colgar»,
// un F5, la pestaña descartada), la pestaña sacada volvía a entrar sola y le
// quitaba la llamada a la app; la app, con su propia recarga, se la volvía a
// quitar. Lo que se fija acá:
//
//  1. Quién tiene la sala, visto desde el lugar que la soltó: la app («app»),
//     otra ventana o el navegador («otroLado», si quien la soltó es la app) u
//     otra pestaña de este mismo navegador («pestana», el cartel de siempre).
//  2. La marca «esta pestaña soltó la sala» sobrevive a la recarga, caduca y se
//     borra; mientras está, connect() no entra salvo con `tomarLaSala` (el botón).
//  3. Los textos de cada cartel, en español sin voseo y en inglés.
//  4. Guardas del fuente: dónde se anota, dónde se consulta y que la re-entrada
//     automática nunca entra «a propósito».
// El comportamiento del hook y de la vista se prueba en useLiveKit.test.ts y en
// LiveKitCallView.test.tsx.
import { describe, it, expect, beforeEach } from "vitest";
import { DisconnectReason } from "livekit-client";
import {
  CLAVES_SALA_TOMADA, VENTANA_OTRA_PESTANA_MS, VIGENCIA_SALA_SOLTADA_MS,
  anotarQueEntro, anotarSalaSoltada, debeReintentar, esEntradaDeOtraPestana, olvidarSalaSoltada, otraPestanaEntroA,
  quienTieneLaSala, salaSoltada,
} from "@/lib/sesionDuplicada";
import { conexionDeSala, fueUnaCaida } from "@/lib/conexionSala";
import { compartido } from "@/lib/i18n/compartido";

const fuentes = import.meta.glob([
  "/frontend/src/hooks/useLiveKit.ts",
  "/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx",
  "/frontend/src/lib/coworkLatido.ts",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const leer = (final: string): string => {
  const clave = Object.keys(fuentes).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return fuentes[clave];
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("1. quién tiene la sala", () => {
  it("si la soltó la app, la tiene otra ventana o el navegador", () => {
    expect(quienTieneLaSala({ soyLaApp: true, otraPestanaEntro: false })).toBe("otroLado");
    expect(quienTieneLaSala({ soyLaApp: true, otraPestanaEntro: true })).toBe("otroLado");
  });

  it("si la soltó una pestaña y no fue otra pestaña de este navegador, la tiene la app", () => {
    expect(quienTieneLaSala({ soyLaApp: false, otraPestanaEntro: false })).toBe("app");
  });

  it("dos pestañas del mismo navegador: el caso de siempre", () => {
    expect(quienTieneLaSala({ soyLaApp: false, otraPestanaEntro: true })).toBe("pestana");
  });

  it("la marca de entrada de otra pestaña vale solo para esa sala, de otra pestaña y reciente", () => {
    const ahora = 1_000_000;
    const marca = { sala: "s1", pestana: "B", t: ahora - 2_000 };
    expect(esEntradaDeOtraPestana(marca, "s1", "A", ahora)).toBe(true);
    expect(esEntradaDeOtraPestana(marca, "s1", "B", ahora)).toBe(false); // la propia
    expect(esEntradaDeOtraPestana(marca, "s2", "A", ahora)).toBe(false); // otra sala
    expect(esEntradaDeOtraPestana({ ...marca, t: ahora - VENTANA_OTRA_PESTANA_MS }, "s1", "A", ahora)).toBe(false);
    expect(esEntradaDeOtraPestana(null, "s1", "A", ahora)).toBe(false);
  });

  it("lo que anota ESTA pestaña al entrar no cuenta como «otra pestaña»", () => {
    anotarQueEntro("s1");
    expect(otraPestanaEntroA("s1")).toBe(false);
    localStorage.setItem("maven.sala-entrando", JSON.stringify({ sala: "s1", pestana: "otra", t: Date.now() }));
    expect(otraPestanaEntroA("s1")).toBe(true);
    localStorage.setItem("maven.sala-entrando", "{roto");
    expect(otraPestanaEntroA("s1")).toBe(false);
  });

  it("la identidad duplicada sigue sin ser caída ni reintento: no hay pelea", () => {
    expect(debeReintentar(DisconnectReason.DUPLICATE_IDENTITY)).toBe(false);
    expect(fueUnaCaida(DisconnectReason.DUPLICATE_IDENTITY)).toBe(false);
    // Para el reloj de Cowork es «reemplazada» (no late, no se cobra como caída),
    // también si la pestaña nunca llegó a conectar (la recarga que no entra).
    expect(conexionDeSala("disconnected", DisconnectReason.DUPLICATE_IDENTITY, false)).toBe("reemplazada");
  });
});

describe("2. «esta pestaña soltó la sala»", () => {
  it("se anota por sala con quién la tiene, y se borra", () => {
    expect(salaSoltada("s1")).toBeNull();
    anotarSalaSoltada("s1", "app");
    expect(salaSoltada("s1")).toBe("app");
    expect(salaSoltada("s2")).toBeNull();
    olvidarSalaSoltada("s1");
    expect(salaSoltada("s1")).toBeNull();
  });

  it("caduca a las 12 horas (y lo que no se entiende no vale)", () => {
    const t = 5_000_000;
    anotarSalaSoltada("s1", "otroLado", t);
    expect(salaSoltada("s1", t + VIGENCIA_SALA_SOLTADA_MS - 1)).toBe("otroLado");
    expect(salaSoltada("s1", t + VIGENCIA_SALA_SOLTADA_MS)).toBeNull();
    expect(sessionStorage.getItem("sala-soltada:s1")).toBeNull(); // la vencida se limpia
    sessionStorage.setItem("sala-soltada:s1", JSON.stringify({ quien: "cualquiera", t: Date.now() }));
    expect(salaSoltada("s1")).toBeNull();
    sessionStorage.setItem("sala-soltada:s1", "{roto");
    expect(salaSoltada("s1")).toBeNull();
  });
});

describe("3. los carteles", () => {
  it("app: lo que pidió Alvaro, palabra por palabra", () => {
    expect(compartido[CLAVES_SALA_TOMADA.app.titulo].es).toBe("Sigues en la llamada desde la app de Maven");
    expect(compartido[CLAVES_SALA_TOMADA.app.detalle].es).toBe("Esta pestaña soltó la llamada.");
    expect(compartido[CLAVES_SALA_TOMADA.app.usarAqui].es).toBe("Usar esta pestaña");
  });

  it("la app que soltó la sala: otra ventana o el navegador", () => {
    expect(compartido[CLAVES_SALA_TOMADA.otroLado.titulo].es).toBe("Sigues en la llamada desde otra ventana o el navegador");
    expect(compartido[CLAVES_SALA_TOMADA.otroLado.usarAqui].es).toBe("Usar esta ventana");
  });

  it("dos pestañas: el cartel de siempre", () => {
    expect(CLAVES_SALA_TOMADA.pestana.usarAqui).toBe("shared.otherTab.useHere");
  });

  it("todos tienen inglés", () => {
    for (const caso of Object.values(CLAVES_SALA_TOMADA)) {
      for (const clave of Object.values(caso)) {
        expect(compartido[clave].en.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("4. guardas del fuente", () => {
  it("los fuentes se cargaron", () => {
    expect(Object.keys(fuentes).length).toBe(3);
  });

  it("useLiveKit: al ser sacada anota la sala soltada y quién la tiene, y lo manda a llamada_cortes", () => {
    const s = leer("hooks/useLiveKit.ts");
    const handler = s.slice(s.indexOf("room.on(RoomEvent.Disconnected, (razon)"), s.indexOf("// ── Connect & publish tracks"));
    expect(handler).toMatch(/quienTieneLaSala\(\{ soyLaApp: escritorio\(\) !== null, otraPestanaEntro: otraPestanaEntroA\(room\.name\) \}\)/);
    expect(handler).toContain("anotarSalaSoltada(room.name, quien)");
    expect(handler).toMatch(/cliente: escritorio\(\) \? "app" : "navegador", quien/);
    // La re-entrada sigue atada a fueUnaCaida (que es false para DUPLICATE_IDENTITY).
    expect(handler).toMatch(/if \(fueUnaCaida\(razon\)\) \{[\s\S]*programarReentradaRef\.current\(razon\)/);
  });

  it("useLiveKit: connect() consulta la marca ANTES de entrar, y solo `tomarLaSala` la salta", () => {
    const s = leer("hooks/useLiveKit.ts");
    const inicio = s.indexOf("const connect = useCallback(async (");
    const bloque = s.slice(inicio, s.indexOf("ultimaConexionRef.current = {", inicio));
    expect(bloque).toMatch(/if \(options\.tomarLaSala\) \{\s*olvidarSalaSoltada\(roomName\);/);
    expect(bloque).toMatch(/const quien = salaSoltada\(roomName\);\s*if \(quien\) \{[\s\S]*?return;/);
    // Antes de crear la sala, no después.
    expect(bloque).not.toContain("new Room(");
    expect(bloque).toContain("anotarQueEntro(roomName)");
  });

  it("useLiveKit: la re-entrada automática nunca entra «a propósito»", () => {
    const s = leer("hooks/useLiveKit.ts");
    expect(s).toContain("ultimaConexionRef.current = { roomName, participantName, isAdmin, options: { ...options, tomarLaSala: false } }");
  });

  it("la vista: solo el botón del cartel pide tomarLaSala, y salir a propósito borra la marca", () => {
    const s = leer("videocall/LiveKitCallView.tsx");
    const asignaciones = s.match(/tomarLaSalaRef\.current = true/g) ?? [];
    expect(asignaciones.length).toBe(1);
    expect(s).toMatch(/onClick=\{\(\) => \{ tomarLaSalaRef\.current = true; setReintentoManual\(\(n\) => n \+ 1\); \}\}/);
    expect(s).toMatch(/const tomarLaSala = tomarLaSalaRef\.current;\s*tomarLaSalaRef\.current = false;/);
    const salir = s.slice(s.indexOf("const handleLeave = useCallback"), s.indexOf("lk.disconnect(); onLeave();"));
    expect(salir).toContain("olvidarSalaSoltada(roomName)");
  });

  it("Cowork: el lugar que soltó la sala no late (no pisa el tramo del que sí está)", () => {
    expect(leer("lib/coworkLatido.ts")).toContain('if (v.estado.conexionSala === "reemplazada") return;');
  });
});
