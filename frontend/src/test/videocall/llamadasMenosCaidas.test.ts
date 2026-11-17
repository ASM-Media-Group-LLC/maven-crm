// LLAMADAS CON MENOS CAÍDAS (Alvaro, 17/11/2026: «minimizar las caídas, también
// con gente de afuera»). Guardas de lo que se arregló a partir del diagnóstico:
//
//  1. Volver solo tras una caída: 10 intentos en ~2 minutos y en el acto si
//     vuelve la red (antes 4 en ~22 s).
//  2. El equipo dormido: no se cuenta como caída, no se vuelve solo y ese tiempo
//     no se paga en Cowork.
//  3. Los invitados de afuera: se miden (por meet-guest) y, si se les cae, vuelven
//     solos durante 15 minutos sin que los admitan otra vez.
//  4. Cowork más liviano: todo en vivo, a 10 fps la cámara y 5 la pantalla.
//  5. «Tu internet está débil»: solo un aviso.
//  6. El aviso de versión nueva con llamada no trae el botón que la cortaba.
//  7. Mapas de fuente ocultos, que nunca se sirven.
//
// Casi nada de esto falla de forma ruidosa si se rompe (una caída de más, un
// invitado que tiene que volver a golpear): por eso las guardas.
import { describe, it, expect, vi } from "vitest";
import { ESPERAS_DE_REENTRADA_MS, MAX_REENTRADAS, esperaDeReentrada } from "@/lib/conexionSala";
import { SALTO_DE_SUENO_MS, crearVigiaDelSueno, faseSegunSueno } from "@/lib/equipoDormido";
import { BIEN_SOSTENIDO_MS, DEBIL_INICIAL, DEBIL_SOSTENIDO_MS, siguienteDebil, type EstadoDebil } from "@/lib/internetDebil";
import { crearAvisoDeVersion } from "@/lib/avisoDeVersion";
import { CAMARA_LIVIANA, FPS_DE_COWORK, topesDeCowork, topesLivianos, type TopeDeCodificacion } from "@/lib/perfilDeCamara";
import {
  CAPTURA_COWORK, PUBLICACION_DE_PANTALLA, PUBLICACION_DE_PANTALLA_COWORK, PUBLICACION_DE_PANTALLA_LIVIANA, opcionesDePantalla,
} from "@/lib/perfilDePantalla";
import { cuentaComoTrabajo, estadoDeTiempo } from "@/lib/coworkTiempoRegla";

const fuentes = import.meta.glob([
  "/frontend/src/hooks/useLiveKit.ts",
  "/frontend/src/hooks/useMeetGuest.ts",
  "/frontend/src/pages/meet/MeetGuestPage.tsx",
  "/frontend/src/pages/messenger/videocall/LiveKitCallView.tsx",
  "/frontend/src/pwa.ts",
  "/supabase/functions/meet-guest/index.ts",
  "/supabase/migrations/20261117150000_llamadas_invitados.sql",
  "/supabase/migrations/20261114020000_argos_llamadas_hoy.sql",
  "/supabase/migrations/20261111080000_salud_de_llamada.sql",
  "/vite.config.ts",
  "/Dockerfile",
  "/nginx.conf",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

const leer = (final: string): string => {
  const clave = Object.keys(fuentes).find((k) => k.endsWith(final));
  if (!clave) throw new Error(`no se cargó el fuente ${final} (glob vacío)`);
  return fuentes[clave];
};

describe("los fuentes se cargaron de verdad", () => {
  it("están todos los que se revisan", () => {
    expect(Object.keys(fuentes).length).toBe(12);
  });
});

describe("1. volver solo tras una caída: más paciente", () => {
  it("10 intentos, cada espera mayor o igual que la anterior, ~2 minutos en total", () => {
    expect(MAX_REENTRADAS).toBe(10);
    const total = ESPERAS_DE_REENTRADA_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(100_000);
    expect(total).toBeLessThanOrEqual(140_000);
    for (let i = 1; i < ESPERAS_DE_REENTRADA_MS.length; i++) {
      expect(ESPERAS_DE_REENTRADA_MS[i]).toBeGreaterThanOrEqual(ESPERAS_DE_REENTRADA_MS[i - 1]);
    }
    expect(esperaDeReentrada(1)).toBe(2000);
    expect(esperaDeReentrada(0)).toBeNull();
    expect(esperaDeReentrada(11)).toBeNull();
  });

  it("useLiveKit usa el tope nuevo, vuelve en el acto con `online` y sin red no gasta intentos", () => {
    const s = leer("hooks/useLiveKit.ts");
    const bloque = s.slice(s.indexOf("programarReentradaRef.current = (razon"), s.indexOf("esperarALaPersonaRef.current = (razon"));
    expect(bloque).toContain("reentradasRef.current >= MAX_REENTRADAS");
    expect(bloque).toContain("esperaDeReentrada(n)");
    expect(bloque).toMatch(/addEventListener\("online", intentar\)/);
    expect(bloque).toMatch(/navigator\.onLine === false/);
    expect(bloque).not.toMatch(/>= 4\b/);
  });
});

describe("2. el equipo dormido", () => {
  const reloj = () => {
    let t = 1_000_000;
    let tic: (() => void) | null = null;
    const vigia = crearVigiaDelSueno({
      ahora: () => t,
      cadaMs: 5000,
      relojes: { setInterval: (fn) => { tic = fn; return 1; }, clearInterval: () => { tic = null; } },
    });
    return { vigia, pasar: (ms: number) => { t += ms; }, tocar: () => tic?.() };
  };

  it("con el reloj corriendo normal, no se durmió", () => {
    const r = reloj();
    for (let i = 0; i < 20; i++) { r.pasar(5000); r.tocar(); }
    expect(r.vigia.durmioHacePoco()).toBeNull();
  });

  it("un hueco de más de un minuto entre dos toques = se durmió (también antes de que suene el toque)", () => {
    const r = reloj();
    r.pasar(5000 + SALTO_DE_SUENO_MS + 30_000);
    expect(r.vigia.durmioHacePoco()?.ms).toBeGreaterThan(SALTO_DE_SUENO_MS); // recién despierta
    r.tocar();
    expect(r.vigia.durmioHacePoco()).not.toBeNull();
    // Pasan 4 minutos despierto, con el reloj sonando normal.
    for (let i = 0; i < 48; i++) { r.pasar(5000); r.tocar(); }
    expect(r.vigia.durmioHacePoco()).toBeNull();
  });

  it("⚠️ un minuto de pestaña adormecida por Chrome NO es dormir (el umbral es más de un minuto de más)", () => {
    const r = reloj();
    r.pasar(60_000); // Chrome deja los relojes de atrás en uno por minuto
    r.tocar();
    expect(r.vigia.durmioHacePoco()).toBeNull();
  });

  it("los cortes con el equipo dormido van con su propia fase, que las métricas no cuentan", () => {
    expect(faseSegunSueno("caida", true)).toBe("equipo_dormido");
    expect(faseSegunSueno("parpadeo_ok", true)).toBe("parpadeo_ok_tras_dormir");
    expect(faseSegunSueno("reentrada_agotada", true)).toBe("reentrada_agotada_tras_dormir");
    expect(faseSegunSueno("caida", false)).toBe("caida");
    expect(faseSegunSueno("salida", true)).toBe("salida");
    // Las métricas de caídas cuentan una lista cerrada de fases: las nuevas quedan afuera.
    for (const m of ["20261114020000_argos_llamadas_hoy.sql", "20261111080000_salud_de_llamada.sql"]) {
      const sql = leer(m);
      expect(sql).toContain("fase in ('parpadeo_ok', 'caida', 'reentrada_agotada', 'recarga')");
      expect(sql).not.toContain("equipo_dormido");
    }
  });

  it("useLiveKit: con el equipo dormido NO programa la vuelta sola, espera a la persona", () => {
    const s = leer("hooks/useLiveKit.ts");
    expect(s).toMatch(/if \(durmio\) esperarALaPersonaRef\.current\(razon\);\s*else programarReentradaRef\.current\(razon\);/);
    const espera = s.slice(s.indexOf("esperarALaPersonaRef.current = (razon"), s.indexOf("// ── Disconnect"));
    expect(espera).toContain("setEquipoDormido(true)");
    expect(espera).toMatch(/"pointerdown", "pointermove", "keydown", "touchstart", "wheel"/);
    expect(espera).toContain("visibilitychange");
    // Sin «focus»: el navegador puede devolver el foco solo al despertar.
    expect(espera).not.toMatch(/"focus"/);
    expect(s).toContain("faseSegunSueno(fase, !!sueno)");
  });

  it("el reloj de Cowork: «dormido» no se paga, exija lo que exija la sesión", () => {
    const l = { camOn: true, screenShareOn: true, conexionSala: "dormido" as const };
    const v = estadoDeTiempo(l, Date.now());
    expect(v).toEqual({ estado: "sin_conexion_larga", detalle: "equipo_dormido" });
    expect(cuentaComoTrabajo(v.estado)).toBe(false);
    expect(estadoDeTiempo(l, Date.now(), 60_000, { camara: false, pantalla: false }).estado).toBe("sin_conexion_larga");
    // La pausa sigue mandando.
    expect(estadoDeTiempo({ ...l, onBreak: true }, Date.now()).estado).toBe("pausa");
  });

  it("la vista manda «dormido» al reloj y muestra el cartel con su botón", () => {
    const s = leer("videocall/LiveKitCallView.tsx");
    expect(s).toMatch(/lk\.equipoDormido && conexionDeLaSala === "desconectada" \? "dormido" : conexionDeLaSala/);
    expect(s).toContain('const salaCaida = conexionDeLaSala === "desconectada"');
    expect(s).toContain('"messenger.callView.equipoDormido"');
  });
});

describe("3. los invitados de afuera", () => {
  it("15 minutos para volver solo, con la decisión anotada", () => {
    const s = leer("meet-guest/index.ts");
    expect(s).toMatch(/Alvaro, 17\/11\/2026: 15 min/);
    expect(s).toMatch(/const REENTRADA_DEL_INVITADO_MS = 15 \* 60 \* 1000;/);
  });

  it("claim: «left» salvo una CAÍDA de hace menos de 15 min; lee con `*` (sin la columna no se rompe)", () => {
    const s = leer("meet-guest/index.ts");
    const claim = s.slice(s.indexOf('if (action === "claim")'));
    expect(claim).toContain('.select("*")');
    expect(claim).toMatch(/if \(request\.left_at && !puedeVolverSolo\(request, Date\.now\(\)\)\) return json\(req, \{ status: "left" \}\);/);
    // Vuelve con la misma admisión: se borra la salida antes de emitir el token.
    expect(claim.indexOf("update({ left_at: null })")).toBeLessThan(claim.indexOf("createGuestToken("));
    expect(claim.indexOf("agenciaDeReunion(")).toBeLessThan(claim.indexOf("update({ left_at: null })"));
    expect(s).toMatch(/p\.salio_a_proposito === false && Number\.isFinite\(fuera\) && fuera <= REENTRADA_DEL_INVITADO_MS/);
  });

  it("leave distingue colgar (termina la admisión) de una caída; un cliente viejo cuenta como colgar", () => {
    const s = leer("meet-guest/index.ts");
    const leave = s.slice(s.indexOf('if (action === "leave")'), s.indexOf('if (action === "telemetria")'));
    expect(leave).toContain("const porCaida = body.caida === true;");
    expect(leave).toContain("salio_a_proposito: !porCaida");
  });

  it("telemetría: solo con pedido admitido, fases conocidas y topes", () => {
    const s = leer("meet-guest/index.ts");
    const tel = s.slice(s.indexOf('if (action === "telemetria")'), s.indexOf('if (action === "claim")'));
    expect(tel).toContain('p.status !== "admitted"');
    expect(tel).toContain("FASES_DE_CORTE.has(fase)");
    expect(tel).toMatch(/count >= tope/);
    // Un fallo al contar no es «cero».
    expect(tel).toMatch(/if \(errCuenta \|\| count === null\)/);
    // La fila sale del pedido, no del navegador.
    expect(tel).toContain("guest_request_id: p.id, meet_room_id: p.meet_room_id");
  });

  it("la migración: tablas cerradas (escribe solo el servidor), leen admin y dueño", () => {
    const sql = leer("20261117150000_llamadas_invitados.sql");
    for (const t of ["llamada_cortes_invitados", "llamada_salud_invitados"]) {
      expect(sql).toContain(`alter table public.${t} enable row level security;`);
      expect(sql).toMatch(new RegExp(`on public\\.${t}\\s+for select to authenticated\\s+using \\(public\\.es_admin_o_dueno\\(\\(select auth\\.uid\\(\\)\\)\\)\\)`));
    }
    expect(sql).not.toMatch(/for insert/i);
    expect(sql).toContain("add column if not exists salio_a_proposito boolean not null default true");
  });

  it("el invitado: telemetría por meet-guest, cerrar/recargar es caída, y en el error solo «Reintentar»", () => {
    const hook = leer("hooks/useMeetGuest.ts");
    expect(hook).toMatch(/addEventListener\("pagehide", alIrse\)/);
    expect(hook).toContain('enviarSinEsperar("leave", { guestToken: g, caida: true })');
    expect(hook).toContain('tipo: "corte"');
    expect(hook).toContain("keepalive: true");
    const pagina = leer("meet/MeetGuestPage.tsx");
    expect(pagina).toMatch(/telemetria=\{telemetria\}\s*\n\s*sinVolverEnError/);
    const vista = leer("videocall/LiveKitCallView.tsx");
    expect(vista).toMatch(/\{!sinVolverEnError && \(\s*<button onClick=\{handleLeave\}/);
    expect(vista).toContain("telemetria: telemetriaRef.current");
  });

  it("useLiveKit manda los cortes y la salud al destino del invitado cuando lo hay", () => {
    const s = leer("hooks/useLiveKit.ts");
    expect(s).toContain("telemetriaRef.current = options.telemetria ?? null;");
    expect(s).toMatch(/if \(telemetriaRef\.current\) \{\s*telemetriaRef\.current\.corte\(fila\);/);
    expect(s).toContain("if (telemetriaRef.current) telemetriaRef.current.salud(filaDeSalud);");
  });
});

describe("4. Cowork más liviano: todo en vivo, menos cuadros", () => {
  const normales720 = (): TopeDeCodificacion[] => [
    { scaleResolutionDownBy: 4, maxBitrate: 160_000, maxFramerate: 20 },
    { scaleResolutionDownBy: 2, maxBitrate: 450_000, maxFramerate: 20 },
    { scaleResolutionDownBy: 1, maxBitrate: 1_700_000, maxFramerate: 30 },
  ];

  it("la cámara normal en Cowork: misma resolución, 10 fps, bitrate en proporción", () => {
    expect(FPS_DE_COWORK).toBe(10);
    const t = topesDeCowork(normales720());
    expect(t[2]).toEqual({ scaleResolutionDownBy: 1, maxBitrate: 700_000, maxFramerate: 10 });
    expect(t[1]).toEqual({ scaleResolutionDownBy: 2, maxBitrate: 250_000, maxFramerate: 10 });
    expect(t[0]).toEqual({ scaleResolutionDownBy: 4, maxBitrate: 90_000, maxFramerate: 10 });
  });

  it("la cámara liviana en Cowork a 10 fps; fuera de Cowork (Meet) queda como estaba", () => {
    const enCowork = topesLivianos(normales720(), 720, true);
    expect(enCowork.every((c) => c.maxFramerate === 10)).toBe(true);
    expect(enCowork[2].maxBitrate).toBeLessThanOrEqual(250_000);
    const enMeet = topesLivianos(normales720(), 720);
    expect(enMeet[2]).toEqual({ scaleResolutionDownBy: 2, maxBitrate: CAMARA_LIVIANA.alta.maxBitrate, maxFramerate: CAMARA_LIVIANA.alta.maxFramerate });
  });

  it("nunca sube nada: una capa que ya tenía menos se queda con lo suyo", () => {
    const t = topesDeCowork([{ scaleResolutionDownBy: 1, maxBitrate: 300_000, maxFramerate: 5 }]);
    expect(t[0]).toEqual({ scaleResolutionDownBy: 1, maxBitrate: 300_000, maxFramerate: 5 });
  });

  it("la pantalla en Cowork: 1080p a 5 fps; el liviano ya era de 5; Meet como siempre", () => {
    const base = { audio: true };
    const cowork = opcionesDePantalla("normal", base, true);
    expect(cowork.publicacion).toBe(PUBLICACION_DE_PANTALLA_COWORK);
    expect(PUBLICACION_DE_PANTALLA_COWORK.screenShareEncoding?.maxFramerate).toBeLessThanOrEqual(5);
    expect(PUBLICACION_DE_PANTALLA_COWORK.screenShareEncoding?.maxBitrate).toBeLessThanOrEqual(1_500_000);
    expect(PUBLICACION_DE_PANTALLA_COWORK.degradationPreference).toBe("maintain-framerate");
    expect(cowork.captura).toEqual({ ...base, ...CAPTURA_COWORK });
    expect(opcionesDePantalla("liviano", base, true).publicacion).toBe(PUBLICACION_DE_PANTALLA_LIVIANA);
    expect(opcionesDePantalla("normal", base).publicacion).toBe(PUBLICACION_DE_PANTALLA);
  });

  it("useLiveKit aplica el tope de Cowork también al perfil normal, y solo en salas de Cowork", () => {
    const s = leer("hooks/useLiveKit.ts");
    expect(s).toContain("const topes = liviano ? topesLivianos(antes, ladoCorto, conPrueba) : topesDeCowork(antes);");
    expect(s).toContain("if (liviano || conPrueba) {");
    expect(s).toContain("const pantalla = opcionesDePantalla(perfil, captura, salaConPrueba(room.name));");
  });

  it("⚠️ quien habla o está fijado se sigue viendo nítido: la calidad por voz sigue en la vista", () => {
    const s = leer("videocall/LiveKitCallView.tsx");
    expect(s).toMatch(/aplicaCalidadPorVoz/);
    // Y el tope de Cowork NO baja la resolución de ninguna capa (solo cuadros y bitrate).
    const t = topesDeCowork([{ scaleResolutionDownBy: 1, maxBitrate: 1_700_000, maxFramerate: 30 }]);
    expect(t[0].scaleResolutionDownBy).toBe(1);
  });
});

describe("5. «Tu internet está débil»: solo un aviso", () => {
  const correr = (lecturas: Array<[boolean, number]>): EstadoDebil => {
    let e = DEBIL_INICIAL;
    for (const [mala, t] of lecturas) e = siguienteDebil(e, mala, t);
    return e;
  };

  it("un bache corto no avisa; mala 10 s seguidos, sí", () => {
    expect(correr([[true, 0], [true, 4000], [false, 6000]]).mostrando).toBe(false);
    expect(correr([[true, 0], [true, 4000], [true, DEBIL_SOSTENIDO_MS]]).mostrando).toBe(true);
  });

  it("se va solo cuando lleva unos segundos bien, sin parpadear", () => {
    const mostrando = correr([[true, 0], [true, DEBIL_SOSTENIDO_MS]]);
    const t0 = DEBIL_SOSTENIDO_MS;
    let e = siguienteDebil(mostrando, false, t0 + 1000);
    expect(e.mostrando).toBe(true);
    e = siguienteDebil(e, true, t0 + 2000); // vuelve a estar mala: sigue
    e = siguienteDebil(e, false, t0 + 3000);
    e = siguienteDebil(e, false, t0 + 3000 + BIEN_SOSTENIDO_MS);
    expect(e.mostrando).toBe(false);
  });

  it("useLiveKit no apaga nada por esto: solo prende el aviso", () => {
    const s = leer("hooks/useLiveKit.ts");
    const vigia = s.slice(s.indexOf("const vigiaDebil = window.setInterval"), s.indexOf("}, MIRAR_DEBIL_CADA_MS);"));
    expect(vigia).toContain("setInternetDebil(debil.mostrando)");
    expect(vigia).not.toMatch(/setCameraEnabled|setScreenShareEnabled|setMicrophoneEnabled|setParameters|disconnect/);
    expect(vigia).toMatch(/ConnectionQuality\.Poor \|\| q === ConnectionQuality\.Lost \|\| limitadoPorRed/);
    expect(leer("videocall/LiveKitCallView.tsx")).toContain('t("messenger.callView.internetDebil")');
  });
});

describe("6. el aviso de versión nueva con una llamada andando", () => {
  it("con llamada: el aviso sin botón; al colgar, el de siempre", () => {
    let enLlamada = true;
    let tic: (() => void) | null = null;
    const enLl = vi.fn();
    const normal = vi.fn();
    const avisar = crearAvisoDeVersion({
      enLlamada: () => enLlamada,
      mostrarEnLlamada: enLl,
      mostrarNormal: normal,
      programar: (fn) => { tic = fn; return 7; },
      cancelar: () => { tic = null; },
    });
    avisar();
    expect(enLl).toHaveBeenCalledTimes(1);
    expect(normal).not.toHaveBeenCalled();
    tic!();
    expect(normal).not.toHaveBeenCalled(); // sigue en la llamada
    enLlamada = false;
    tic!();
    expect(normal).toHaveBeenCalledTimes(1);
    expect(tic).toBeNull();
  });

  it("sin llamada: el de siempre, directo", () => {
    const normal = vi.fn();
    crearAvisoDeVersion({ enLlamada: () => false, mostrarEnLlamada: vi.fn(), mostrarNormal: normal, programar: () => 1, cancelar: () => {} })();
    expect(normal).toHaveBeenCalledTimes(1);
  });

  it("pwa.ts lo usa con hayLlamadaActiva, y el aviso con llamada NO trae acción", () => {
    const s = leer("src/pwa.ts");
    expect(s).toContain("crearAvisoDeVersion({");
    expect(s).toContain("enLlamada: hayLlamadaActiva,");
    const enLlamada = s.slice(s.indexOf("mostrarEnLlamada: () => {"), s.indexOf("mostrarNormal: () =>"));
    expect(enLlamada).toContain('"pwa.actualizar.enLlamada"');
    expect(enLlamada).not.toContain("action");
  });
});

describe("7. mapas de fuente: se generan ocultos y nunca se sirven", () => {
  it("vite los genera «hidden» (los .js no los nombran)", () => {
    expect(leer("/vite.config.ts")).toContain('sourcemap: process.env.MAVEN_MAPAS === "1" ? "hidden" : false');
  });

  it("el Dockerfile los saca de la imagen después del build", () => {
    const d = leer("/Dockerfile");
    expect(d.indexOf("RUN find dist -name '*.map' -type f -delete")).toBeGreaterThan(d.indexOf("RUN npm run build"));
    expect(d.indexOf("RUN find dist -name '*.map' -type f -delete")).toBeLessThan(d.indexOf("COPY --from=builder /app/dist"));
  });

  it("nginx no los sirve aunque estén", () => {
    expect(leer("/nginx.conf")).toMatch(/location ~\* \\\.map\$ \{\s*return 404;\s*\}/);
  });
});
