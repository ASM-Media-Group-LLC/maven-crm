import { describe, it, expect } from "vitest";
import {
  estadoDeTiempo, cuentaComoTrabajo, UMBRAL_FUERA_DE_CAMARA_MS, INTERVALO_LATIDO_MS, LATIDO_VENCIDO_MS, ESTADOS_TIEMPO, EXIGE_TODO,
  TOPE_SIN_CONEXION_MS, VENTANA_SIN_CONEXION_MS, NO_COBRABA_DESDE_MS, CONEXIONES_SALA,
} from "@/lib/coworkTiempoRegla";
// La edge tiene SU copia (el frontend no puede importar de supabase/: el build
// de Dokploy excluye esa carpeta). Acá se comprueba que digan lo mismo.
import * as edge from "../../../../supabase/functions/_shared/cowork-tiempo";
const { OTRO_EQUIPO_VIVO_MS } = edge;

const T = 1_700_000_000_000;
const base = { camOn: true, screenShareOn: true, faceState: "ok", faceSince: T - 10 * 60_000 };

describe("estadoDeTiempo — cuándo corre el reloj de Cowork", () => {
  it("corre con cámara + pantalla y alguien delante", () => {
    expect(estadoDeTiempo(base, T)).toEqual({ estado: "activo", detalle: "ok" });
    expect(cuentaComoTrabajo("activo")).toBe(true);
  });
  it("se detiene sin cámara, sin pantalla o en pausa (en ese orden de prioridad)", () => {
    expect(estadoDeTiempo({ ...base, camOn: false }, T).estado).toBe("sin_camara");
    expect(estadoDeTiempo({ ...base, screenShareOn: false }, T).estado).toBe("sin_pantalla");
    expect(estadoDeTiempo({ ...base, onBreak: true, camOn: false }, T).estado).toBe("pausa");
    expect(cuentaComoTrabajo("pausa")).toBe(false);
  });
  it("mal encuadre y poca luz NO detienen el reloj (son alertas, no ausencia)", () => {
    expect(estadoDeTiempo({ ...base, faceState: "too_small" }, T).estado).toBe("activo");
    expect(estadoDeTiempo({ ...base, faceState: "too_dark" }, T).estado).toBe("activo");
  });
  it("'no hay nadie' detiene el reloj solo después del umbral de tolerancia", () => {
    const recien = { ...base, faceState: "no_face", faceSince: T - 5_000 };
    expect(estadoDeTiempo(recien, T).estado).toBe("activo");
    const hace1min = { ...base, faceState: "no_face", faceSince: T - UMBRAL_FUERA_DE_CAMARA_MS };
    expect(estadoDeTiempo(hace1min, T)).toEqual({ estado: "fuera_de_camara", detalle: "no_face" });
  });
  it("un faceSince del futuro o ausente cuenta como 'recién'", () => {
    expect(estadoDeTiempo({ ...base, faceState: "no_face", faceSince: T + 99_000 }, T).estado).toBe("activo");
    expect(estadoDeTiempo({ ...base, faceState: "no_face", faceSince: null }, T).estado).toBe("activo");
  });

  it("el umbral es configurable: con 30 s se detiene antes, con 300 s aguanta más", () => {
    const hace45 = { ...base, faceState: "no_face", faceSince: T - 45_000 };
    expect(estadoDeTiempo(hace45, T, 30_000).estado).toBe("fuera_de_camara");
    expect(estadoDeTiempo(hace45, T, 60_000).estado).toBe("activo");
    expect(estadoDeTiempo(hace45, T, 300_000).estado).toBe("activo");
  });

  it("la copia del frontend y la de la edge dicen EXACTAMENTE lo mismo", () => {
    expect(UMBRAL_FUERA_DE_CAMARA_MS).toBe(edge.UMBRAL_FUERA_DE_CAMARA_MS);
    expect(INTERVALO_LATIDO_MS).toBe(edge.INTERVALO_LATIDO_MS);
    expect(LATIDO_VENCIDO_MS).toBe(edge.LATIDO_VENCIDO_MS);
    expect([...ESTADOS_TIEMPO]).toEqual([...edge.ESTADOS_TIEMPO]);
    const casos: Array<[Parameters<typeof estadoDeTiempo>[0], number | undefined, { camara: boolean; pantalla: boolean } | undefined]> = [];
    for (const camOn of [true, false]) for (const screenShareOn of [true, false]) for (const onBreak of [true, false, undefined])
      for (const faceState of ["ok", "no_face", "too_small", "too_dark", null, undefined])
        for (const faceSince of [T - 5_000, T - 60_000, T - 600_000, T + 1_000, null, undefined])
          for (const umbral of [undefined, 30_000, 300_000])
            for (const exige of [undefined, EXIGE_TODO, { camara: true, pantalla: false }, { camara: false, pantalla: true }, { camara: false, pantalla: false }])
              casos.push([{ camOn, screenShareOn, onBreak, faceState, faceSince }, umbral, exige]);
    for (const [l, umbral, exige] of casos) {
      expect(estadoDeTiempo(l, T, umbral, exige)).toEqual(edge.estadoDeTiempo(l, T, umbral, exige));
    }
    expect(casos.length).toBeGreaterThan(2000);
  });

  it("el reloj exige lo que exige la sesión: sin regla de pantalla, no se detiene por pantalla", () => {
    const soloCamara = { camara: true, pantalla: false };
    expect(estadoDeTiempo({ camOn: true, screenShareOn: false, faceState: "ok" }, T, undefined, soloCamara).estado).toBe("activo");
    expect(estadoDeTiempo({ camOn: false, screenShareOn: false }, T, undefined, soloCamara).estado).toBe("sin_camara");
    const fuera = { camOn: true, screenShareOn: false, faceState: "no_face", faceSince: T - 120_000 };
    expect(estadoDeTiempo(fuera, T, undefined, soloCamara).estado).toBe("fuera_de_camara");
  });
  it("sin regla de cámara, ni la cámara ni 'fuera de cámara' detienen el reloj", () => {
    const soloPantalla = { camara: false, pantalla: true };
    expect(estadoDeTiempo({ camOn: false, screenShareOn: true }, T, undefined, soloPantalla).estado).toBe("activo");
    const fuera = { camOn: true, screenShareOn: true, faceState: "no_face", faceSince: T - 120_000 };
    expect(estadoDeTiempo(fuera, T, undefined, soloPantalla).estado).toBe("activo");
    expect(estadoDeTiempo({ camOn: false, screenShareOn: false }, T, undefined, soloPantalla).estado).toBe("sin_pantalla");
    // La pausa detiene siempre.
    expect(estadoDeTiempo({ camOn: false, screenShareOn: false, onBreak: true }, T, undefined, { camara: false, pantalla: false }).estado).toBe("pausa");
  });
});


describe("meet grupal — cuenta como trabajo", () => {
  const T = Date.parse("2026-09-10T15:00:00Z");
  it("en meet el reloj corre aunque no comparta pantalla; la pausa manda igual", () => {
    expect(estadoDeTiempo({ camOn: true, screenShareOn: false, faceState: "ok", faceSince: null, enMeet: true }, T)).toEqual({ estado: "meet", detalle: null });
    expect(estadoDeTiempo({ camOn: false, screenShareOn: false, faceState: null, faceSince: null, enMeet: true, onBreak: true }, T).estado).toBe("pausa");
    expect(cuentaComoTrabajo("meet")).toBe(true);
    expect(edge.cuentaComoTrabajo("meet")).toBe(true);
  });
});

// ── LA SALA SE CAYÓ ─────────────────────────────────────────────────────────
// Antes, con LiveKit caído la lista de participantes se vaciaba, la cámara se
// veía apagada y el reloj anotaba "sin cámara": se le cobraba la caída a quien
// estaba trabajando. Decisión de Jhon (29/09): estado propio, y se pagan hasta
// TOPE_SIN_CONEXION_MS de caídas por VENTANA_SIN_CONEXION_MS. Lo decide el
// SERVIDOR con los tramos guardados (caidaSePaga).
describe("sin conexión a la sala", () => {
  const T = Date.parse("2026-09-29T15:00:00Z");
  const trabajando = { camOn: true, screenShareOn: true, faceState: "ok", faceSince: T - 600_000 };
  // Así se ve alguien con la sala caída: la cámara "apagada" es mentira.
  const caida = { camOn: false, screenShareOn: false, faceState: null, faceSince: null, conexionSala: "desconectada" as const };

  it("una caída NO es 'sin cámara': es su propio estado, y se paga", () => {
    expect(estadoDeTiempo(caida, T)).toEqual({ estado: "sin_conexion", detalle: null });
    expect(cuentaComoTrabajo("sin_conexion")).toBe(true);
    expect(edge.cuentaComoTrabajo("sin_conexion")).toBe(true);
  });

  it("la que el servidor decidió no pagar es 'sin_conexion_larga', y no cuenta", () => {
    expect(estadoDeTiempo(caida, T, undefined, undefined, false).estado).toBe("sin_conexion_larga");
    expect(cuentaComoTrabajo("sin_conexion_larga")).toBe(false);
    expect(edge.cuentaComoTrabajo("sin_conexion_larga")).toBe(false);
  });

  it("la pausa y el meet le ganan (un 'desconectada' pegado no los pisa)", () => {
    expect(estadoDeTiempo({ ...caida, onBreak: true }, T).estado).toBe("pausa");
    expect(estadoDeTiempo({ ...caida, enMeet: true }, T).estado).toBe("meet");
  });

  it("⚠️ si la sesión no exige cámara ni pantalla, una caída no detiene nada (como hoy)", () => {
    expect(estadoDeTiempo(caida, T, undefined, { camara: false, pantalla: false }).estado).toBe("activo");
    expect(estadoDeTiempo(caida, T, undefined, { camara: true, pantalla: false }).estado).toBe("sin_conexion");
    expect(estadoDeTiempo(caida, T, undefined, { camara: false, pantalla: true }).estado).toBe("sin_conexion");
  });

  it("'reconectando' usa la regla de siempre: la cámara sigue diciendo la verdad", () => {
    expect(estadoDeTiempo({ ...trabajando, conexionSala: "reconectando" }, T).estado).toBe("activo");
    expect(estadoDeTiempo({ ...trabajando, camOn: false, conexionSala: "reconectando" }, T).estado).toBe("sin_camara");
  });

  it("⚠️ sin el dato (navegador con la versión anterior) todo queda EXACTAMENTE como hoy", () => {
    const sinDato = { camOn: false, screenShareOn: false, faceState: null, faceSince: null };
    expect(estadoDeTiempo(sinDato, T).estado).toBe("sin_camara");
    expect(estadoDeTiempo({ ...sinDato, conexionSala: null }, T).estado).toBe("sin_camara");
    expect(estadoDeTiempo({ ...trabajando, conexionSala: "conectada" }, T).estado).toBe("activo");
  });

  it("la copia del frontend y la de la edge dicen lo mismo con el dato nuevo", () => {
    expect(TOPE_SIN_CONEXION_MS).toBe(edge.TOPE_SIN_CONEXION_MS);
    expect(VENTANA_SIN_CONEXION_MS).toBe(edge.VENTANA_SIN_CONEXION_MS);
    expect(NO_COBRABA_DESDE_MS).toBe(edge.NO_COBRABA_DESDE_MS);
    expect([...CONEXIONES_SALA]).toEqual([...edge.CONEXIONES_SALA]);
    // La matriz de arriba no recorre `conexionSala` ni `enMeet`: esta sí.
    let casos = 0;
    for (const camOn of [true, false]) for (const screenShareOn of [true, false])
      for (const onBreak of [true, false, undefined]) for (const enMeet of [true, false, undefined])
        for (const conexionSala of [...CONEXIONES_SALA, null, undefined])
          for (const caidaPagada of [true, false])
            for (const exige of [EXIGE_TODO, { camara: true, pantalla: false }, { camara: false, pantalla: true }, { camara: false, pantalla: false }]) {
              const l = { camOn, screenShareOn, onBreak, enMeet, conexionSala, faceState: "ok", faceSince: null };
              expect(estadoDeTiempo(l, T, undefined, exige, caidaPagada)).toEqual(edge.estadoDeTiempo(l, T, undefined, exige, caidaPagada));
              casos++;
            }
    // Que PUEDA fallar: si un bucle quedara vacío, esto no probaría nada.
    // 7 de conexión: las cinco (con «dormido», 17/11/2026), null y undefined.
    expect(casos).toBe(2 * 2 * 3 * 3 * 7 * 2 * 4);
    for (const e of ESTADOS_TIEMPO) expect(cuentaComoTrabajo(e)).toBe(edge.cuentaComoTrabajo(e));
  });
});

describe("caidaSePaga — el presupuesto y la racha los lleva el servidor", () => {
  const T = Date.parse("2026-09-29T15:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  const tramo = (estado: string, desde: number, hasta: number | null, visto = hasta ?? T) =>
    ({ estado, started_at: iso(desde), ended_at: hasta === null ? null : iso(hasta), last_seen_at: iso(visto) });
  const min = 60_000;

  it("sinConexionPagadaMs suma solo lo pagado dentro de la ventana", () => {
    const tramos = [
      tramo("sin_conexion", T - 70 * min, T - 65 * min), // fuera de la ventana
      tramo("sin_conexion", T - 62 * min, T - 58 * min), // mitad adentro: 2 min
      tramo("sin_conexion_larga", T - 30 * min, T - 20 * min), // no pagado: no cuenta
      tramo("activo", T - 20 * min, T - 5 * min), // otro estado: no cuenta
      tramo("sin_conexion", T - 5 * min, T - 4 * min), // 1 min
    ];
    expect(edge.sinConexionPagadaMs(tramos, T, false)).toBe(3 * min);
  });

  it("el tramo abierto cuenta hasta ahora si sigue vigente, y hasta su último latido si venció", () => {
    const abierto = [tramo("sin_conexion", T - 6 * min, null, T - 5 * min)];
    expect(edge.sinConexionPagadaMs(abierto, T, true)).toBe(6 * min);
    expect(edge.sinConexionPagadaMs(abierto, T, false)).toBe(min);
  });

  it("se paga mientras quede presupuesto y no viniera sin cobrar", () => {
    expect(edge.caidaSePaga(false, 0)).toBe(true);
    expect(edge.caidaSePaga(false, TOPE_SIN_CONEXION_MS - 1)).toBe(true);
    expect(edge.caidaSePaga(false, TOPE_SIN_CONEXION_MS)).toBe(false);
    expect(edge.caidaSePaga(true, 0)).toBe(false);
  });

  describe("noCobrabaAlCaerse — la racha, no el último tramo", () => {
    it("trabajando, en pausa, o sin nada antes: no venía sin cobrar", () => {
      expect(edge.noCobrabaAlCaerse([], T)).toBe(false);
      expect(edge.noCobrabaAlCaerse([tramo("activo", T - 20 * min, null)], T)).toBe(false);
      expect(edge.noCobrabaAlCaerse([tramo("meet", T - 20 * min, null)], T)).toBe(false);
      expect(edge.noCobrabaAlCaerse([tramo("pausa", T - 20 * min, null)], T)).toBe(false);
      // Una caída pagada en curso: decide el presupuesto, no esto.
      expect(edge.noCobrabaAlCaerse([tramo("sin_conexion", T - 3 * min, null)], T)).toBe(false);
    });

    it("la cámara apagada hace un minuto o más: sí", () => {
      for (const estado of ["sin_camara", "sin_pantalla", "fuera_de_camara"]) {
        expect(edge.noCobrabaAlCaerse([tramo(estado, T - NO_COBRABA_DESDE_MS, null)], T), estado).toBe(true);
        // Un parpadeo de segundos (volver a publicar la cámara al reconectar) no.
        expect(edge.noCobrabaAlCaerse([tramo(estado, T - 5_000, null)], T), estado).toBe(false);
      }
    });

    it("⚠️ la racha suma tramos seguidos: 20 min sin pantalla y 30 s sin cámara es 'venía sin cobrar'", () => {
      const tramos = [tramo("sin_pantalla", T - 20 * min, T - 30_000), tramo("sin_camara", T - 30_000, null)];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(true);
    });

    it("⚠️ un corte de red de 3 minutos NO borra lo de antes", () => {
      // Cámara apagada desde las 14:00, se corta la red a las 14:29:40 y el
      // primer latido llega a las 14:33. El tramo abierto está vencido, pero
      // sigue diciendo que no estaba trabajando.
      const tramos = [tramo("sin_camara", T - 33 * min, null, T - 3.5 * min)];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(true);
    });

    it("pasados 30 minutos sin latidos es otra caída: lo de antes ya no cuenta", () => {
      const tramos = [tramo("sin_camara", T - 3 * 60 * min, null, T - 31 * min)];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(false);
    });

    it("⚠️ una caída larga no vuelve a pagarse por un reconectar de segundos", () => {
      const tramos = [tramo("sin_conexion_larga", T - 15 * min, T - 40_000), tramo("sin_camara", T - 40_000, null)];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(true);
      expect(edge.noCobrabaAlCaerse([tramo("sin_conexion_larga", T - 1_000, null)], T)).toBe(true);
    });

    it("volver de una caída PAGADA y caerse otra vez a los segundos sigue siendo pagable", () => {
      const tramos = [tramo("sin_conexion", T - 4 * min, T - 5_000), tramo("sin_camara", T - 5_000, null)];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(false);
    });

    it("⚠️ tocar 'Baño' unos segundos NO vuelve pagable una caída que no se pagaba", () => {
      const tramos = [
        tramo("sin_pantalla", T - 22 * min, T - 2 * min),
        tramo("sin_conexion_larga", T - 2 * min, T - 60_000),
        tramo("pausa", T - 60_000, T - 50_000),
      ];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(true);
    });

    it("la pausa no corta la racha ni suma: 30 s + pausa de 5 min + 20 s sin cámara son 50 s", () => {
      const tramos = [
        tramo("sin_camara", T - 6 * min, T - 5.5 * min),
        tramo("pausa", T - 5.5 * min, T - 20_000),
        tramo("sin_camara", T - 20_000, null),
      ];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(false);
    });

    it("quien volvió del baño TRABAJANDO cobra la caída", () => {
      const tramos = [tramo("activo", T - 30 * min, T - 5 * min), tramo("pausa", T - 5 * min, T - 10_000)];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(false);
    });

    it("un hueco de más de LATIDO_VENCIDO_MS entre tramos corta la racha", () => {
      const tramos = [tramo("sin_pantalla", T - 30 * min, T - 10 * min), tramo("sin_camara", T - 20_000, null)];
      expect(edge.noCobrabaAlCaerse(tramos, T)).toBe(false);
    });
  });

  // Reproduce lo que hace la edge (index.ts): arma el latido, decide si la caída
  // se paga con los tramos guardados, y si el estado no cambia estira el tramo;
  // si cambia, lo cierra en el último latido y abre otro. Un `null` en la línea
  // de tiempo es un latido que no llegó (red cortada).
  type Evento = { conexionSala: "desconectada" | "conectada"; onBreak?: boolean; camOn?: boolean } | null;
  const simular = (eventoEn: (i: number) => Evento, minutos: number, previo?: { estado: string; desde: number }) => {
    type Fila = { estado: string; started_at: string; ended_at: string | null; last_seen_at: string };
    const tramos: Fila[] = [];
    let abierto: Fila | null = previo ? { estado: previo.estado, started_at: iso(previo.desde), ended_at: null, last_seen_at: iso(T) } : null;
    if (abierto) tramos.push(abierto);
    for (let i = 0; i * INTERVALO_LATIDO_MS <= minutos * min; i++) {
      const ahora = T + i * INTERVALO_LATIDO_MS;
      const ev = eventoEn(i);
      if (!ev) continue;
      const l = { camOn: ev.camOn ?? true, screenShareOn: ev.camOn ?? true, faceState: "ok", onBreak: !!ev.onBreak, conexionSala: ev.conexionSala };
      const vigente = !!abierto && ahora - Date.parse(abierto.last_seen_at) <= LATIDO_VENCIDO_MS;
      const pagada = edge.caidaSePaga(
        edge.noCobrabaAlCaerse(tramos, ahora),
        edge.sinConexionPagadaMs(tramos, ahora, vigente && abierto?.estado === "sin_conexion"),
      );
      const { estado } = edge.estadoDeTiempo(l, ahora, undefined, undefined, pagada);
      if (abierto && vigente && abierto.estado === estado) { abierto.last_seen_at = iso(ahora); continue; }
      if (abierto) abierto.ended_at = abierto.last_seen_at;
      abierto = { estado, started_at: iso(ahora), ended_at: null, last_seen_at: iso(ahora) };
      tramos.push(abierto);
    }
    if (abierto) abierto.ended_at = abierto.last_seen_at;
    const pagadoSinConexion = tramos.filter((t) => t.estado === "sin_conexion")
      .reduce((acc, t) => acc + (Date.parse(t.ended_at!) - Date.parse(t.started_at)), 0);
    return { tramos, pagadoSinConexion };
  };

  it("⚠️ 25 minutos de caída continua: se pagan como mucho 10, en dos tramos", () => {
    const { tramos, pagadoSinConexion } = simular(() => ({ conexionSala: "desconectada" }), 25);
    expect(pagadoSinConexion).toBeLessThanOrEqual(TOPE_SIN_CONEXION_MS);
    expect(pagadoSinConexion).toBeGreaterThan(TOPE_SIN_CONEXION_MS - INTERVALO_LATIDO_MS * 2);
    expect(tramos.map((t) => t.estado)).toEqual(["sin_conexion", "sin_conexion_larga"]);
  });

  it("⚠️ partir la caída con pausas cortas NO estira el pago (la trampa del tope por tramo)", () => {
    const { pagadoSinConexion } = simular((i) => ({ conexionSala: "desconectada", onBreak: i > 0 && i % 19 === 0 }), 60);
    expect(pagadoSinConexion).toBeLessThanOrEqual(TOPE_SIN_CONEXION_MS);
  });

  it("⚠️ ni alternando con latidos 'conectada' de un segundo", () => {
    const { pagadoSinConexion } = simular((i) => ({ conexionSala: i % 7 === 0 ? "conectada" : "desconectada", camOn: false }), 60);
    expect(pagadoSinConexion).toBeLessThanOrEqual(TOPE_SIN_CONEXION_MS);
  });

  it("con la cámara apagada hace rato, la caída entera queda sin pagar", () => {
    const { pagadoSinConexion, tramos } = simular(() => ({ conexionSala: "desconectada" }), 20, { estado: "sin_camara", desde: T - 5 * min });
    expect(pagadoSinConexion).toBe(0);
    expect(tramos.map((t) => t.estado)).toEqual(["sin_camara", "sin_conexion_larga"]);
  });

  it("⚠️ ni aunque en el medio se corte la red tres minutos", () => {
    // Cámara apagada; 6 latidos sin llegar (3 min); después "desconectada".
    const { pagadoSinConexion } = simular((i) => (i < 6 ? null : { conexionSala: "desconectada" }), 20, { estado: "sin_camara", desde: T - 20 * min });
    expect(pagadoSinConexion).toBe(0);
  });
});

describe("latidoDeCuerpo — el nombre del dato no se puede separar entre el navegador y la edge", () => {
  // Memoria del repo: `refs` vs `references` mató una función con 23 tests en
  // verde. Esto hace la ida y vuelta REAL: el cuerpo tal como lo arma
  // coworkLatido (`{ action, sessionId, ...estado }`) entra a la edge.
  it("⚠️ ida y vuelta: lo que manda el navegador llega a la regla", () => {
    for (const conexionSala of CONEXIONES_SALA) {
      const estado = { camOn: true, screenShareOn: true, faceState: "ok", faceSince: 1, onBreak: false, conexionSala };
      const cuerpo = JSON.parse(JSON.stringify({ action: "latido", sessionId: "s", ...estado }));
      expect(edge.latidoDeCuerpo(cuerpo, { enPausa: false, enMeet: false }).conexionSala).toBe(conexionSala);
    }
  });

  it("lo que no llega, o llega raro, queda como 'no se sabe' — nunca como caída", () => {
    const base = { enPausa: false, enMeet: false };
    expect(edge.latidoDeCuerpo({}, base).conexionSala).toBeNull();
    expect(edge.latidoDeCuerpo({ conexionSala: "caida" }, base).conexionSala).toBeNull();
    expect(edge.latidoDeCuerpo({ conexionSala: false }, base).conexionSala).toBeNull();
    expect(edge.latidoDeCuerpo({ conexionSala: null }, base).conexionSala).toBeNull();
  });

  it("arma el resto igual que antes (la pausa y el meet salen de la base)", () => {
    expect(edge.latidoDeCuerpo({ camOn: true, screenShareOn: "sí", faceState: 3, faceSince: "x" }, { enPausa: true, enMeet: true }))
      .toEqual({ camOn: true, screenShareOn: false, faceState: null, faceSince: null, onBreak: true, enMeet: true, conexionSala: null });
    expect(edge.latidoDeCuerpo({ onBreak: true }, { enPausa: false, enMeet: false }).onBreak).toBe(true);
  });
});

// ── DOS EQUIPOS DE LA MISMA PERSONA ─────────────────────────────────────────
// Con la laptop fuera de la sala y el teléfono adentro, los dos latían y se
// pisaban el único tramo abierto: el tiempo del teléfono no sumaba.
describe("latidoDeEquipoAfuera — el equipo que quedó afuera no pisa al que está adentro", () => {
  const T = Date.parse("2026-09-30T15:00:00Z");
  const iso = (ms: number) => new Date(ms).toISOString();
  const abiertoDe = (equipo: string | null, estado = "activo", hace = 10_000) => ({ estado, equipo, last_seen_at: iso(T - hace) });

  it("se ignora al de afuera si el otro equipo latió hace poco EN la sala", () => {
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono"), "laptop", "desconectada", T)).toBe(true);
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono"), "laptop", null, T)).toBe(true);
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono", "pausa"), "laptop", "desconectada", T)).toBe(true);
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono", "sin_camara"), "laptop", "desconectada", T)).toBe(true);
  });

  it("el que está EN la sala nunca se ignora (así un equipo nuevo toma el lugar)", () => {
    expect(edge.latidoDeEquipoAfuera(abiertoDe("laptop"), "telefono", "conectada", T)).toBe(false);
    expect(edge.latidoDeEquipoAfuera(abiertoDe("laptop"), "telefono", "reconectando", T)).toBe(false);
  });

  it("si el otro equipo se fue (no late hace más de 45 s), manda el que queda", () => {
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono", "activo", OTRO_EQUIPO_VIVO_MS + 1), "laptop", "desconectada", T)).toBe(false);
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono", "activo", OTRO_EQUIPO_VIVO_MS), "laptop", "desconectada", T)).toBe(true);
  });

  it("si el otro también está afuera, no hay a quién darle prioridad", () => {
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono", "sin_conexion"), "laptop", "desconectada", T)).toBe(false);
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono", "sin_conexion_larga"), "laptop", "desconectada", T)).toBe(false);
  });

  it("⚠️ con la versión anterior (sin equipo) todo queda como antes", () => {
    expect(edge.latidoDeEquipoAfuera(abiertoDe("telefono"), null, "desconectada", T)).toBe(false);
    expect(edge.latidoDeEquipoAfuera(abiertoDe(null), "laptop", "desconectada", T)).toBe(false);
    expect(edge.latidoDeEquipoAfuera(null, "laptop", "desconectada", T)).toBe(false);
    // Un mismo equipo nunca se ignora a sí mismo: su propia caída se anota.
    expect(edge.latidoDeEquipoAfuera(abiertoDe("laptop"), "laptop", "desconectada", T)).toBe(false);
  });

  it("equipoDeCuerpo es estricto", () => {
    expect(edge.equipoDeCuerpo({ equipo: "abc" })).toBe("abc");
    expect(edge.equipoDeCuerpo({})).toBeNull();
    expect(edge.equipoDeCuerpo({ equipo: "" })).toBeNull();
    expect(edge.equipoDeCuerpo({ equipo: 3 })).toBeNull();
    expect(edge.equipoDeCuerpo({ equipo: "x".repeat(65) })).toBeNull();
  });

  // Reproduce lo que hace la edge (index.ts) con los latidos de DOS equipos.
  type Latir = { equipo: string | null; conexionSala: "conectada" | "desconectada"; camOn: boolean };
  const simularDos = (latidos: Array<{ en: number } & Latir>, usarRegla: boolean) => {
    type Fila = { estado: string; started_at: string; ended_at: string | null; last_seen_at: string; equipo: string | null };
    const tramos: Fila[] = [];
    let abierto: Fila | null = null;
    for (const lt of latidos.sort((a, b) => a.en - b.en)) {
      const ahora = T + lt.en;
      if (usarRegla && abierto && edge.latidoDeEquipoAfuera(abierto, lt.equipo, lt.conexionSala, ahora)) continue;
      const vigente = !!abierto && ahora - Date.parse(abierto.last_seen_at) <= LATIDO_VENCIDO_MS;
      const l = { camOn: lt.camOn, screenShareOn: lt.camOn, faceState: "ok", conexionSala: lt.conexionSala };
      const { estado } = edge.estadoDeTiempo(l, ahora, undefined, undefined, true);
      if (abierto && vigente && abierto.estado === estado) { abierto.last_seen_at = iso(ahora); abierto.equipo = lt.equipo; continue; }
      if (abierto) abierto.ended_at = abierto.last_seen_at;
      abierto = { estado, started_at: iso(ahora), ended_at: null, last_seen_at: iso(ahora), equipo: lt.equipo };
      tramos.push(abierto);
    }
    if (abierto) abierto.ended_at = abierto.last_seen_at;
    const activo = tramos.filter((t) => t.estado === "activo").reduce((a, t) => a + (Date.parse(t.ended_at!) - Date.parse(t.started_at)), 0);
    return { activo, tramos };
  };
  const cadaTreinta = (desde: number, hasta: number, desfase: number, lt: Latir) =>
    Array.from({ length: Math.floor((hasta - desde) / 30_000) + 1 }, (_, i) => ({ en: desde + desfase + i * 30_000, ...lt }));

  it("⚠️ el teléfono trabajando 30 min con la laptop abierta afuera: SUMA los 30 min", () => {
    const telefono = cadaTreinta(0, 30 * 60_000, 0, { equipo: "telefono", conexionSala: "conectada", camOn: true });
    const laptop = cadaTreinta(0, 30 * 60_000, 15_000, { equipo: "laptop", conexionSala: "desconectada", camOn: false });
    // Sin la regla (lo de antes): casi cero.
    expect(simularDos([...telefono, ...laptop], false).activo).toBeLessThan(60_000);
    // Con la regla: el turno entero.
    const { activo } = simularDos([...telefono, ...laptop], true);
    expect(activo).toBeGreaterThanOrEqual(30 * 60_000 - 30_000);
  });

  it("si el teléfono se apaga, a los 45 s manda la laptop (su caída se anota)", () => {
    const telefono = cadaTreinta(0, 10 * 60_000, 0, { equipo: "telefono", conexionSala: "conectada", camOn: true });
    const laptop = cadaTreinta(0, 15 * 60_000, 15_000, { equipo: "laptop", conexionSala: "desconectada", camOn: false });
    const { tramos } = simularDos([...telefono, ...laptop], true);
    expect(tramos.map((t) => t.estado)).toEqual(["activo", "sin_conexion"]);
  });
});
