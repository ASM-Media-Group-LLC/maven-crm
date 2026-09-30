// Los textos de Cowork que salen de un ESTADO (pausa del supervisor, reloj
// detenido, frase del break) viven ahora en el diccionario y no en las funciones
// de lib/. Dos cosas que no pueden pasar en silencio:
//   1. que el español del diccionario deje de decir lo mismo que lib/ (en
//      español la pantalla tiene que quedar igual que antes);
//   2. que un estado nuevo llegue sin su clave (en inglés saldría la clave).
import type { ReactNode } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { getTranslation } from "@/lib/i18n";
import { ESTADOS_SUPERVISOR, fraseDePausaSupervisor, subtituloDePausaSupervisor, fijarPausaSupervisor } from "@/lib/pausaSupervisor";
import { motivoDetenido, motivoDetenidoDeOtro } from "@/lib/coworkReloj";
import { ESTADOS_TIEMPO, cuentaComoTrabajo } from "@/lib/coworkTiempoRegla";
import { FRASES_DE_PAUSA } from "@/lib/frasesDePausa";
import { ETIQUETA_SUPERVISOR, FRASE_SUPERVISOR, SUBTITULO_SUPERVISOR, claveMotivoDetenido } from "@/pages/cowork/textosCowork";
import SalaEnPausa from "@/pages/cowork/SalaEnPausa";
import PausaSupervisorBoton from "@/pages/cowork/PausaSupervisorBoton";
import { enEspanol } from "./enIngles";

const es = (k: Parameters<typeof getTranslation>[0]) => getTranslation(k, "es");

describe("el español del diccionario es el mismo de lib/", () => {
  it("la pausa del supervisor: chapa, frase y subtítulo", () => {
    for (const { valor, etiqueta } of ESTADOS_SUPERVISOR) {
      expect(es(ETIQUETA_SUPERVISOR[valor])).toBe(etiqueta);
      expect(es(FRASE_SUPERVISOR[valor])).toBe(fraseDePausaSupervisor(valor));
      expect(es(SUBTITULO_SUPERVISOR[valor])).toBe(subtituloDePausaSupervisor(valor));
    }
  });

  it("por qué está detenido el reloj, a la persona y a los demás", () => {
    for (const estado of ESTADOS_TIEMPO) {
      const propio = claveMotivoDetenido(estado);
      const deOtro = claveMotivoDetenido(estado, true);
      expect(propio ? es(propio) : null).toBe(motivoDetenido(estado));
      expect(deOtro ? es(deOtro) : null).toBe(motivoDetenidoDeOtro(estado));
    }
  });

  it("⚠️ todo estado en que el reloj se DETIENE tiene su motivo (null contra null no vale)", () => {
    // La prueba de arriba compara el diccionario con lib/: si faltaran los dos,
    // daría null contra null y pasaría en verde. Esta no.
    let detenidos = 0;
    for (const estado of ESTADOS_TIEMPO) {
      if (cuentaComoTrabajo(estado)) continue;
      detenidos++;
      expect(claveMotivoDetenido(estado), estado).not.toBeNull();
      expect(claveMotivoDetenido(estado, true), estado).not.toBeNull();
      expect(motivoDetenido(estado), estado).not.toBeNull();
      expect(motivoDetenidoDeOtro(estado), estado).not.toBeNull();
    }
    expect(detenidos).toBeGreaterThanOrEqual(5);
  });

  it("las frases del break, en el mismo orden", () => {
    const claves = ["cowork.pauseTile.phrase1", "cowork.pauseTile.phrase2", "cowork.pauseTile.phrase3", "cowork.pauseTile.phrase4"] as const;
    expect(claves.length).toBe(FRASES_DE_PAUSA.length);
    claves.forEach((k, i) => expect(es(k)).toBe(FRASES_DE_PAUSA[i]));
  });
});

describe("las piezas chicas en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    fijarPausaSupervisor(null);
  });

  const T = new Date("2026-09-08T12:04:00-05:00").getTime();
  const conIdioma = (ui: ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>);

  it("la miniatura en pausa: break bien, break pasado, baño y meet", () => {
    const { rerender } = conIdioma(<SalaEnPausa pausa={{ kind: "break", segundos: 60, desde: T, limiteMin: 45, consumidoSeg: 0, excedida: false }} />);
    expect(screen.getByText("On break")).toBeTruthy();
    expect(screen.getByText("44 min left")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
    for (const pausa of [
      { kind: "break" as const, segundos: 50 * 60, desde: T, limiteMin: 45, consumidoSeg: 0, excedida: true },
      { kind: "bano" as const, segundos: 200, desde: T, limiteMin: 10, consumidoSeg: 220, excedida: false },
      { kind: "bano" as const, segundos: 700, desde: T, limiteMin: 10, consumidoSeg: 0, excedida: true },
      { kind: "meet" as const, segundos: 300, desde: T, limiteMin: null, consumidoSeg: 0, excedida: false },
    ]) {
      rerender(<LanguageProvider><SalaEnPausa pausa={pausa} /></LanguageProvider>);
      expect(enEspanol(document.body)).toEqual([]);
    }
    expect(screen.getByText("In group meet")).toBeTruthy();
  });

  it("la tacita del supervisor y su menú", () => {
    conIdioma(<PausaSupervisorBoton />);
    const boton = screen.getByRole("button", { name: "Supervisor pause" });
    expect(boton.getAttribute("title")).toBe("Mark a pause: break, lunch or away");
    fireEvent.click(boton);
    expect(screen.getByText("Your chatters will see that you're paused")).toBeTruthy();
    fireEvent.click(screen.getByText("Away"));
    expect(enEspanol(document.body)).toEqual([]);
    expect(screen.getByRole("button", { name: "Supervisor pause" }).getAttribute("title")).toBe("You're away. Tap to change.");
  });
});
