// LA SALA SE CAYÓ: lo que decide el navegador, y lo que ve cada uno.
//
// Antes, con LiveKit caído la lista de participantes se vaciaba, la cámara se
// veía apagada y el reloj anotaba "sin cámara". Además la persona quedaba con la
// grilla vacía, sin cartel ni reconexión, y en el tablero DESAPARECÍA de su sala
// mientras sonaba "tiene la cámara apagada". Decisión de Jhon (29/09/2026).
import { describe, it, expect } from "vitest";
import { ConnectionState, DisconnectReason } from "livekit-client";
import { conexionDeSala, fueUnaCaida, caidaEnCurso, marcarCaida, olvidarCaida } from "@/lib/conexionSala";
import { personasEnSala, relojDeRespaldo, sinConexionConLaSala } from "@/lib/coworkOcupacion";
import { segundosMostrados, relojDesdePresencia, motivoDetenido, motivoDetenidoDeOtro } from "@/lib/coworkReloj";
import { relojDeRespuesta } from "@/lib/coworkLatido";
import { ESTADOS_TIEMPO } from "@/lib/coworkTiempoRegla";

describe("conexionDeSala — qué se le dice al reloj", () => {
  it("conectada y reconectando no dependen de nada más", () => {
    expect(conexionDeSala(ConnectionState.Connected, null, false)).toBe("conectada");
    expect(conexionDeSala(ConnectionState.Reconnecting, null, true)).toBe("reconectando");
    expect(conexionDeSala(ConnectionState.SignalReconnecting, null, true)).toBe("reconectando");
  });

  it("⚠️ entrar por primera vez (o cambiar de sala) NO es caerse", () => {
    // Si no, cada entrada dejaría un tramo de segundos de "sin conexión".
    expect(conexionDeSala(ConnectionState.Connecting, null, false)).toBeNull();
    expect(conexionDeSala(ConnectionState.Disconnected, null, false)).toBeNull();
  });

  it("después de haber estado adentro, perder la sala SÍ es una caída", () => {
    expect(conexionDeSala(ConnectionState.Disconnected, DisconnectReason.SIGNAL_CLOSE, true)).toBe("desconectada");
    expect(conexionDeSala(ConnectionState.Disconnected, DisconnectReason.CONNECTION_TIMEOUT, true)).toBe("desconectada");
    expect(conexionDeSala(ConnectionState.Disconnected, DisconnectReason.SERVER_SHUTDOWN, true)).toBe("desconectada");
    // Razón desconocida (un intento de volver que falló no trae razón): caída.
    expect(conexionDeSala(ConnectionState.Disconnected, null, true)).toBe("desconectada");
    // Y mientras intenta volver, sigue caída.
    expect(conexionDeSala(ConnectionState.Connecting, null, true)).toBe("desconectada");
  });

  it("⚠️ la otra pestaña es 'reemplazada', nunca una caída", () => {
    expect(conexionDeSala(ConnectionState.Disconnected, DisconnectReason.DUPLICATE_IDENTITY, true)).toBe("reemplazada");
    expect(conexionDeSala(ConnectionState.Disconnected, DisconnectReason.DUPLICATE_IDENTITY, false)).toBe("reemplazada");
  });

  it("⚠️ salir a propósito, o que la saque el supervisor, NO es una caída pagada", () => {
    for (const r of [DisconnectReason.CLIENT_INITIATED, DisconnectReason.PARTICIPANT_REMOVED, DisconnectReason.ROOM_DELETED, DisconnectReason.ROOM_CLOSED, DisconnectReason.USER_REJECTED]) {
      expect(conexionDeSala(ConnectionState.Disconnected, r, true), String(r)).toBeNull();
      expect(fueUnaCaida(r), String(r)).toBe(false);
    }
  });

  it("fueUnaCaida: la duda se resuelve reintentando, salvo la otra pestaña", () => {
    expect(fueUnaCaida(null)).toBe(true);
    expect(fueUnaCaida(undefined)).toBe(true);
    expect(fueUnaCaida(DisconnectReason.UNKNOWN_REASON)).toBe(true);
    expect(fueUnaCaida(DisconnectReason.DUPLICATE_IDENTITY)).toBe(false);
  });
});

describe("'hay una caída en curso' sobrevive a recargar la página", () => {
  // Sin esto, un F5 en medio de la caída hacía que el primer intento fallido se
  // leyera como "primera entrada": el reloj volvía a anotar "sin cámara".
  it("se marca por sala, se lee, y se olvida al salir a propósito", () => {
    sessionStorage.clear();
    expect(caidaEnCurso("sala-a")).toBe(false);
    marcarCaida("sala-a");
    expect(caidaEnCurso("sala-a")).toBe(true);
    expect(caidaEnCurso("sala-b")).toBe(false);
    olvidarCaida("sala-a");
    expect(caidaEnCurso("sala-a")).toBe(false);
  });

  it("sin almacenamiento (ventana privada) no revienta: simplemente no se recuerda", () => {
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new Error("bloqueado"); } });
    try {
      expect(() => marcarCaida("x")).not.toThrow();
      expect(caidaEnCurso("x")).toBe(false);
      expect(() => olvidarCaida("x")).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "sessionStorage", original);
    }
  });
});

describe("el tablero del supervisor la sigue viendo", () => {
  const AHORA = Date.parse("2026-09-29T15:00:00Z");
  const reloj = (estado: string) => ({ estado: estado as never, segundosHoy: 100, en: AHORA });

  it("⚠️ quien se cayó de la sala NO desaparece de su tarjeta", () => {
    // LiveKit no la ve, pero sigue latiendo con "sin conexión".
    expect(personasEnSala(["ana", "beto"], ["ana"], ["beto"])).toEqual(["ana", "beto"]);
    // Sin caídas, lo de siempre: solo las que LiveKit ve.
    expect(personasEnSala(["ana", "beto"], ["ana"])).toEqual(["ana"]);
    // Una caída que ni siquiera está asignada a la sala no entra.
    expect(personasEnSala(["ana"], ["ana"], ["intrusa"])).toEqual(["ana"]);
  });

  it("solo cuenta como caída con un reloj vivo: una pestaña cerrada no vuelve", () => {
    expect(sinConexionConLaSala(reloj("sin_conexion"))).toBe(true);
    expect(sinConexionConLaSala(reloj("sin_conexion_larga"))).toBe(true);
    expect(sinConexionConLaSala(reloj("sin_camara"))).toBe(false);
    expect(sinConexionConLaSala(null)).toBe(false);
    // El respaldo de la base descarta los latidos viejos, así que una caída de
    // hace una hora no produce reloj.
    const vieja = { seg_activo_hoy: 0, ultimo_estado: "sin_conexion", ultimo_latido: new Date(AHORA - 3_600_000).toISOString() };
    expect(sinConexionConLaSala(relojDeRespaldo(vieja, AHORA))).toBe(false);
  });
});

describe("⚠️ ningún lugar del frontend descarta los estados nuevos en silencio", () => {
  // Había tres listas de estados escritas a mano. Con el estado nuevo afuera, el
  // cronómetro seguía en verde en la pantalla de la persona mientras el servidor
  // lo tenía detenido, y en el tablero la persona quedaba sin reloj.
  const AHORA = Date.parse("2026-09-29T15:00:00Z");
  it("la respuesta del latido, la presencia y el respaldo aceptan TODOS los estados", () => {
    for (const estado of ESTADOS_TIEMPO) {
      expect(relojDeRespuesta({ estado, segundosHoy: 10 }, AHORA)?.estado, estado).toBe(estado);
      expect(relojDesdePresencia({ relojEstado: estado, relojSegundosHoy: 10, relojEn: AHORA })?.estado, estado).toBe(estado);
      expect(relojDeRespaldo({ seg_activo_hoy: 10, ultimo_estado: estado, ultimo_latido: new Date(AHORA).toISOString() }, AHORA)?.estado, estado).toBe(estado);
    }
  });

  it("el cronómetro corre en la caída pagada y se detiene en la larga", () => {
    const hace = (estado: string) => ({ estado: estado as never, segundosHoy: 100, en: AHORA - 30_000 });
    expect(segundosMostrados(hace("sin_conexion"), AHORA)).toBe(130);
    expect(segundosMostrados(hace("sin_conexion_larga"), AHORA)).toBe(100);
    expect(motivoDetenido("sin_conexion")).toBeNull();
    expect(motivoDetenido("sin_conexion_larga")).toBe("sin conexión a la sala");
    expect(motivoDetenidoDeOtro("sin_conexion_larga")).toBe("sin conexión");
  });
});
